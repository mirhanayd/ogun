'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@ogun/db'
import {
  assignClinicalReviewTask,
  getClinicalReviewTaskById,
  insertClinicalReviewAuditLog,
  setClinicalReviewerCapabilities,
  updateClinicalReviewTaskStatus,
  upsertClinicalReviewerProfile,
  type ClinicalProfessionalRole,
  type ClinicalReviewerCapability,
} from '@ogun/db/queries'
import { isReviewerEligibleForTask } from '@ogun/etl/clinical-review-policy'
import { requireAuth } from '@/lib/authz'
import {
  assertClinicalReviewEnabled,
  requireReviewer,
  requireVerifiedReviewer,
  IneligibleReviewerError,
} from '@/lib/clinical-review/authz'

export interface ActionResult<T = unknown> {
  success: boolean
  error?: string
  data?: T
}

/**
 * Allows an authenticated user to submit a request for a clinical reviewer profile.
 * Created profile starts in 'pending' verification status with isActive=false.
 */
export async function requestReviewerRoleAction(
  formData: FormData,
): Promise<ActionResult<{ userId: string }>> {
  try {
    assertClinicalReviewEnabled()
    const session = await requireAuth()

    const role = formData.get('professionalRole') as ClinicalProfessionalRole
    const specialty = (formData.get('specialty') as string)?.trim() || null

    const validRoles: ClinicalProfessionalRole[] = ['pharmacist', 'dietitian', 'physician']
    if (!validRoles.includes(role)) {
      return { success: false, error: 'Geçersiz profesyonel rol seçimi.' }
    }

    // Insert pending profile
    const profile = await upsertClinicalReviewerProfile(db, {
      userId: session.user.id,
      professionalRole: role,
      specialty,
      verificationStatus: 'pending',
      verifiedAt: null,
      verifiedBy: null,
      isActive: false,
      canPublish: false,
    })

    // Assign default initial capabilities based on selected role
    const defaultCapabilities: Record<ClinicalProfessionalRole, ClinicalReviewerCapability[]> = {
      pharmacist: [
        'medication_food',
        'medication_supplement',
        'medication_timing',
        'general_clinical',
      ],
      physician: [
        'medication_food',
        'medication_supplement',
        'medication_timing',
        'condition_nutrient',
        'condition_food',
        'general_clinical',
      ],
      dietitian: [
        'condition_nutrient',
        'condition_food',
        'general_clinical',
      ],
      clinical_admin: [
        'general_clinical',
      ],
    }

    await setClinicalReviewerCapabilities(db, session.user.id, defaultCapabilities[role] ?? [])

    await insertClinicalReviewAuditLog(db, {
      actorUserId: session.user.id,
      eventType: 'reviewer_verified',
      compactChangeSummary: `Reviewer requested profile as ${role}${specialty ? ` (${specialty})` : ''} - pending verification.`,
    })

    revalidatePath('/clinical-review')
    return { success: true, data: { userId: session.user.id } }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Klinik profil başvurusu alınamadı.',
    }
  }
}

/**
 * Claims an unassigned, eligible review task for the currently logged-in verified reviewer.
 */
export async function claimTaskAction(taskId: string): Promise<ActionResult<{ taskId: string }>> {
  try {
    assertClinicalReviewEnabled()
    const session = await requireVerifiedReviewer()

    const task = await getClinicalReviewTaskById(db, taskId)
    if (!task) {
      return { success: false, error: 'İnceleme görevi bulunamadı.' }
    }

    if (task.status === 'published') {
      return { success: false, error: 'Yayınlanmış görevler tekrar talep edilemez.' }
    }

    // Server-side eligibility check
    const eligibility = isReviewerEligibleForTask(session.reviewerContext, {
      subjectType: task.subjectType as 'medication' | 'condition',
      targetType: task.targetType,
      action: task.action,
      requiredCapability: task.requiredCapability,
    })

    if (!eligibility.eligible) {
      throw new IneligibleReviewerError(eligibility.reason)
    }

    // Assign to reviewer
    await assignClinicalReviewTask(db, task.id, session.user.id, 'primary', session.user.id)

    // Update status to assigned if currently pending
    if (task.status === 'pending') {
      await updateClinicalReviewTaskStatus(db, task.id, 'assigned', task.version)
    }

    await insertClinicalReviewAuditLog(db, {
      taskId: task.id,
      actorUserId: session.user.id,
      eventType: 'task_assigned',
      fromStatus: task.status,
      toStatus: task.status === 'pending' ? 'assigned' : task.status,
      compactChangeSummary: `Task claimed by ${session.user.name} (${session.profile.professionalRole})`,
    })

    revalidatePath('/clinical-review')
    revalidatePath('/clinical-review/queue')
    revalidatePath('/clinical-review/assigned')
    revalidatePath(`/clinical-review/task/${task.id}`)

    return { success: true, data: { taskId: task.id } }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Görev talep edilirken bir hata oluştu.',
    }
  }
}

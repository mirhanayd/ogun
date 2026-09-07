'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@ogun/db'
import {
  assignClinicalReviewTask,
  getClinicalReviewerProfile,
  getClinicalReviewerWithCapabilities,
  getClinicalReviewTaskById,
  insertClinicalReviewAuditLog,
  setClinicalReviewerCapabilities,
  updateClinicalReviewerCanPublish,
  updateClinicalReviewerStatus,
  updateClinicalReviewTaskStatus,
  type ClinicalProfessionalRole,
  type ClinicalReviewerCapability,
  type ClinicalReviewerVerificationStatus,
} from '@ogun/db/queries'
import {
  isReviewerEligibleForTask,
  type ClinicalReviewerContext,
} from '@ogun/etl/clinical-review-policy'
import {
  assertClinicalReviewEnabled,
  requireClinicalAdmin,
  IneligibleReviewerError,
} from '@/lib/clinical-review/authz'

export interface AdminActionResult {
  success: boolean
  error?: string
}

/**
 * Updates a reviewer's verification status (verify, suspend, reject).
 */
export async function updateReviewerStatusAction(
  targetUserId: string,
  newStatus: ClinicalReviewerVerificationStatus,
): Promise<AdminActionResult> {
  try {
    assertClinicalReviewEnabled()
    const adminSession = await requireClinicalAdmin()

    const targetProfile = await getClinicalReviewerProfile(db, targetUserId)
    if (!targetProfile) {
      return { success: false, error: 'Hedef hakem profili bulunamadı.' }
    }

    const isActive = newStatus === 'verified'
    const verifiedAt = newStatus === 'verified' ? new Date() : null
    const verifiedBy = newStatus === 'verified' ? adminSession.user.id : null

    await updateClinicalReviewerStatus(
      db,
      targetUserId,
      newStatus,
      isActive,
      verifiedAt,
      verifiedBy,
    )

    const eventType =
      newStatus === 'verified'
        ? 'reviewer_verified'
        : newStatus === 'suspended'
        ? 'reviewer_suspended'
        : 'reviewer_verified'

    await insertClinicalReviewAuditLog(db, {
      actorUserId: adminSession.user.id,
      eventType,
      compactChangeSummary: `Admin ${adminSession.user.name} changed status of ${targetProfile.userName} (${targetProfile.professionalRole}) to ${newStatus}`,
    })

    revalidatePath('/clinical-review/admin/reviewers')
    revalidatePath('/clinical-review')
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Hakem durumu güncellenemedi.',
    }
  }
}

/**
 * Updates a reviewer's clinical capabilities.
 */
export async function updateReviewerCapabilitiesAction(
  targetUserId: string,
  capabilities: ClinicalReviewerCapability[],
): Promise<AdminActionResult> {
  try {
    assertClinicalReviewEnabled()
    const adminSession = await requireClinicalAdmin()

    const targetProfile = await getClinicalReviewerProfile(db, targetUserId)
    if (!targetProfile) {
      return { success: false, error: 'Hedef hakem profili bulunamadı.' }
    }

    await setClinicalReviewerCapabilities(db, targetUserId, capabilities)

    await insertClinicalReviewAuditLog(db, {
      actorUserId: adminSession.user.id,
      eventType: 'reviewer_verified',
      compactChangeSummary: `Admin ${adminSession.user.name} updated capabilities for ${targetProfile.userName}: [${capabilities.join(', ')}]`,
    })

    revalidatePath('/clinical-review/admin/reviewers')
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Yetkinlikler güncellenemedi.',
    }
  }
}

/**
 * Toggles publishing privilege (can_publish) for a verified clinical admin or senior reviewer.
 */
export async function toggleReviewerCanPublishAction(
  targetUserId: string,
  canPublish: boolean,
): Promise<AdminActionResult> {
  try {
    assertClinicalReviewEnabled()
    const adminSession = await requireClinicalAdmin()

    const targetProfile = await getClinicalReviewerProfile(db, targetUserId)
    if (!targetProfile) {
      return { success: false, error: 'Hedef hakem profili bulunamadı.' }
    }

    await updateClinicalReviewerCanPublish(db, targetUserId, canPublish)

    await insertClinicalReviewAuditLog(db, {
      actorUserId: adminSession.user.id,
      eventType: 'reviewer_verified',
      compactChangeSummary: `Admin ${adminSession.user.name} ${canPublish ? 'granted' : 'revoked'} can_publish privilege for ${targetProfile.userName}`,
    })

    revalidatePath('/clinical-review/admin/reviewers')
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Yayınlama yetkisi güncellenemedi.',
    }
  }
}

/**
 * Assigns a specific review task to a reviewer with server-side eligibility check.
 */
export async function assignTaskToReviewerAction(
  taskId: string,
  targetUserId: string,
  assignmentRole: 'primary' | 'secondary' | 'co_review',
): Promise<AdminActionResult> {
  try {
    assertClinicalReviewEnabled()
    const adminSession = await requireClinicalAdmin()

    const task = await getClinicalReviewTaskById(db, taskId)
    if (!task) {
      return { success: false, error: 'Görev bulunamadı.' }
    }

    const targetReviewer = await getClinicalReviewerWithCapabilities(db, targetUserId)
    if (!targetReviewer) {
      return { success: false, error: 'Hedef hakem bulunamadı.' }
    }

    const reviewerContext: ClinicalReviewerContext = {
      userId: targetReviewer.userId,
      role: targetReviewer.professionalRole as ClinicalProfessionalRole,
      specialty: targetReviewer.specialty,
      verificationStatus: targetReviewer.verificationStatus as ClinicalReviewerVerificationStatus,
      isActive: targetReviewer.isActive,
      canPublish: targetReviewer.canPublish,
      capabilities: targetReviewer.capabilities,
    }

    // Eligibility check
    const eligibility = isReviewerEligibleForTask(
      reviewerContext,
      {
        subjectType: task.subjectType as 'medication' | 'condition',
        targetType: task.targetType,
        action: task.action,
        requiredCapability: task.requiredCapability,
      },
      assignmentRole === 'co_review' ? 'co_review' : 'primary',
    )

    if (!eligibility.eligible) {
      throw new IneligibleReviewerError(eligibility.reason)
    }

    await assignClinicalReviewTask(
      db,
      task.id,
      targetUserId,
      assignmentRole,
      adminSession.user.id,
    )

    if (task.status === 'pending') {
      await updateClinicalReviewTaskStatus(db, task.id, 'assigned', task.version)
    }

    await insertClinicalReviewAuditLog(db, {
      taskId: task.id,
      actorUserId: adminSession.user.id,
      eventType: 'task_assigned',
      fromStatus: task.status,
      toStatus: task.status === 'pending' ? 'assigned' : task.status,
      compactChangeSummary: `Admin ${adminSession.user.name} assigned task to ${targetReviewer.userName} (${assignmentRole})`,
    })

    revalidatePath('/clinical-review/admin/reviewers')
    revalidatePath('/clinical-review/queue')
    revalidatePath(`/clinical-review/task/${task.id}`)

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Görev atanamadı.',
    }
  }
}

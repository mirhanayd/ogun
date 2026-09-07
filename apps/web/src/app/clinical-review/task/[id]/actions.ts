'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@ogun/db'
import {
  completeAssignment,
  getClinicalReviewDecisions,
  getClinicalReviewTaskById,
  getClinicalReviewerWithCapabilities,
  insertClinicalReviewAuditLog,
  saveClinicalReviewDecision,
  updateClinicalReviewTaskStatus,
  type ClinicalProfessionalRole,
  type ClinicalReviewerCapability,
  type ClinicalReviewerVerificationStatus,
  type ClinicalReviewTaskStatus,
} from '@ogun/db/queries'
import {
  evaluateTaskConsensus,
  isReviewerEligibleForTask,
  type ClinicalReviewerContext,
} from '@ogun/etl/clinical-review-policy'
import { createClinicalReviewArtifactStore } from '@ogun/etl/clinical-review-artifact-store'
import {
  requireVerifiedReviewer,
  assertClinicalReviewEnabled,
  IneligibleReviewerError,
} from '@/lib/clinical-review/authz'

export interface DecisionActionResult {
  success: boolean
  error?: string
  newStatus?: string
  newVersion?: number
}

const VALID_SEVERITIES = new Set(['info', 'low', 'moderate', 'high', 'critical'])
const VALID_EVIDENCE_STRENGTHS = new Set([
  'strong',
  'moderate',
  'limited',
  'expert_consensus',
  'unknown',
])
const VALID_REJECT_REASONS = new Set([
  'false_positive',
  'wrong_subject',
  'wrong_target',
  'wrong_action',
  'non_clinical_instruction',
  'duplicate',
  'source_problem',
  'other',
])

export async function submitReviewDecisionAction(
  taskId: string,
  expectedVersion: number,
  formData: FormData,
): Promise<DecisionActionResult> {
  try {
    assertClinicalReviewEnabled()
    const session = await requireVerifiedReviewer()

    // 1. Fetch task
    const task = await getClinicalReviewTaskById(db, taskId)
    if (!task) {
      return { success: false, error: 'İnceleme görevi bulunamadı.' }
    }

    // 2. Optimistic concurrency check (Section 22)
    if (task.version !== expectedVersion) {
      return {
        success: false,
        error: 'Bu aday siz incelerken başka bir kullanıcı veya işlem tarafından güncellendi. Lütfen sayfayı yenileyip tekrar deneyin.',
      }
    }

    // 3. Staleness check (Section 8)
    if (task.status === 'source_changed') {
      return {
        success: false,
        error: 'Bu adayın kaynak metni (FDA SPL) değişti. Önceki incelemeler geçersiz kılınmıştır.',
      }
    }

    // 4. Server-side eligibility check (Section 14 & 51)
    const eligibility = isReviewerEligibleForTask(session.reviewerContext, {
      subjectType: task.subjectType as 'medication' | 'condition',
      targetType: task.targetType,
      action: task.action,
      requiredCapability: task.requiredCapability,
    })
    if (!eligibility.eligible) {
      throw new IneligibleReviewerError(eligibility.reason)
    }

    // 5. Fail-closed artifact store check (Section 58)
    const artifactStore = createClinicalReviewArtifactStore()
    const evidenceExists = await artifactStore.exists(task.candidateId, task.candidateSemanticHash)
    if (!evidenceExists) {
      return {
        success: false,
        error: 'Kanıt deposuna (artifact store) ulaşılamadı. Kaynak kanıtlar doğrulanmadan inceleme tamamlanamaz (fail-closed).',
      }
    }

    // 6. Form data extraction
    const decision = formData.get('decision') as string
    const severity = (formData.get('severity') as string) || null
    const evidenceStrength = (formData.get('evidenceStrength') as string) || null
    const approvedTargetKey = (formData.get('approvedTargetKey') as string)?.trim() || null
    const approvedAction = (formData.get('approvedAction') as string)?.trim() || null
    const titleTr = (formData.get('titleTr') as string)?.trim() || null
    const clinicalEffectTr = (formData.get('clinicalEffectTr') as string)?.trim() || null
    const mechanismTr = (formData.get('mechanismTr') as string)?.trim() || null
    const recommendationTr = (formData.get('recommendationTr') as string)?.trim() || null
    const attributionConfirmed = formData.get('attributionConfirmed') === 'true'
    const rejectReason = (formData.get('rejectReason') as string) || null
    const reviewNote = (formData.get('reviewNote') as string)?.trim() || null

    // 7. Decision validation (Sections 39-44)
    if (!['approve', 'reject', 'defer', 'needs_more_evidence'].includes(decision)) {
      return { success: false, error: 'Geçersiz karar seçimi.' }
    }

    if (decision === 'approve') {
      if (!severity || !VALID_SEVERITIES.has(severity)) {
        return { success: false, error: 'Onay için geçerli bir klinik şiddet derecesi (Severity) seçilmelidir.' }
      }
      if (!evidenceStrength || !VALID_EVIDENCE_STRENGTHS.has(evidenceStrength)) {
        return { success: false, error: 'Onay için geçerli bir kanıt gücü (Evidence Strength) seçilmelidir.' }
      }
      if (!approvedTargetKey) {
        return { success: false, error: 'Onaylanan hedef (Approved Target) boş bırakılamaz.' }
      }
      if (!approvedAction) {
        return { success: false, error: 'Onaylanan eylem (Approved Action) boş bırakılamaz.' }
      }

      const hasAttributionRisk =
        task.ingredientAttribution === 'multi_ingredient_unattributed' ||
        task.ingredientAttribution === 'secondary_match_uncertain'

      if (hasAttributionRisk && !attributionConfirmed) {
        return {
          success: false,
          error: 'Çoklu etken madde atıf riski bulunan adaylar için etken madde atıf onayı (Attribution Confirmation) zorunludur.',
        }
      }
    } else if (decision === 'reject') {
      if (!rejectReason || !VALID_REJECT_REASONS.has(rejectReason)) {
        return { success: false, error: 'Ret kararı için geçerli bir gerekçe seçilmelidir.' }
      }
      if (!reviewNote) {
        return { success: false, error: 'Ret kararı için açıklayıcı bir inceleme notu zorunludur.' }
      }
    } else if (decision === 'needs_more_evidence') {
      if (!reviewNote) {
        return { success: false, error: 'Daha fazla kanıt talebi için gereken araştırma/kaynak notu zorunludur.' }
      }
    }

    // 8. Save decision in database
    const decisionId = `crd_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`
    await saveClinicalReviewDecision(db, {
      id: decisionId,
      taskId: task.id,
      reviewerUserId: session.user.id,
      decision: decision as 'approve' | 'reject' | 'defer' | 'needs_more_evidence',
      severity,
      evidenceStrength,
      approvedTargetKey: decision === 'approve' ? approvedTargetKey : null,
      approvedAction: decision === 'approve' ? approvedAction : null,
      titleTr,
      clinicalEffectTr,
      mechanismTr,
      recommendationTr,
      attributionConfirmed: decision === 'approve' ? attributionConfirmed : null,
      rejectReason: decision === 'reject' ? rejectReason : null,
      reviewNote,
      candidateSemanticHash: task.candidateSemanticHash,
      isDraft: false,
    })

    // 9. Mark assignment as completed for this reviewer
    await completeAssignment(db, task.id, session.user.id)

    // 10. Re-evaluate task consensus
    const allDecisions = await getClinicalReviewDecisions(db, task.id, false)
    const reviewerContexts = new Map<string, ClinicalReviewerContext>()

    for (const d of allDecisions) {
      const p = await getClinicalReviewerWithCapabilities(db, d.reviewerUserId)
      if (p) {
        reviewerContexts.set(d.reviewerUserId, {
          userId: p.userId,
          role: p.professionalRole as ClinicalProfessionalRole,
          specialty: p.specialty,
          verificationStatus: p.verificationStatus as ClinicalReviewerVerificationStatus,
          isActive: p.isActive,
          canPublish: p.canPublish,
          capabilities: p.capabilities as ClinicalReviewerCapability[],
        })
      }
    }

    const consensus = evaluateTaskConsensus({
      task: {
        id: task.id,
        status: task.status,
        subjectType: task.subjectType as 'medication' | 'condition',
        targetType: task.targetType,
        action: task.action,
        ingredientAttribution: task.ingredientAttribution,
        requiredCapability: task.requiredCapability,
        candidateSemanticHash: task.candidateSemanticHash,
      },
      decisions: allDecisions.map((d) => ({
        id: d.id,
        reviewerUserId: d.reviewerUserId,
        decision: d.decision as 'approve' | 'reject' | 'defer' | 'needs_more_evidence',
        severity: d.severity,
        evidenceStrength: d.evidenceStrength,
        approvedTargetKey: d.approvedTargetKey,
        approvedAction: d.approvedAction,
        titleTr: d.titleTr,
        clinicalEffectTr: d.clinicalEffectTr,
        mechanismTr: d.mechanismTr,
        recommendationTr: d.recommendationTr,
        attributionConfirmed: d.attributionConfirmed,
        rejectReason: d.rejectReason,
        reviewNote: d.reviewNote,
        candidateSemanticHash: d.candidateSemanticHash,
        isDraft: false,
      })),
      reviewersById: reviewerContexts,
    })

    let nextStatus = task.status
    if (consensus.readyToPublish) {
      nextStatus = 'ready_to_publish'
    } else if (consensus.status === 'needs_more_evidence') {
      nextStatus = 'needs_more_evidence'
    } else if (consensus.status === 'rejected') {
      nextStatus = 'rejected'
    } else if (consensus.status === 'deferred') {
      nextStatus = 'deferred'
    } else if (consensus.status === 'in_review') {
      nextStatus = 'in_review'
    }

    const updatedTask = await updateClinicalReviewTaskStatus(
      db,
      task.id,
      nextStatus as ClinicalReviewTaskStatus,
      task.version,
    )

    // 11. Audit log entry
    await insertClinicalReviewAuditLog(db, {
      taskId: task.id,
      actorUserId: session.user.id,
      eventType: 'decision_saved',
      fromStatus: task.status,
      toStatus: nextStatus,
      compactChangeSummary: `${session.user.name} (${session.profile.professionalRole}) submitted ${decision}${severity ? ` (${severity})` : ''}. Status: ${task.status} -> ${nextStatus}`,
    })

    revalidatePath('/clinical-review')
    revalidatePath('/clinical-review/queue')
    revalidatePath('/clinical-review/assigned')
    revalidatePath(`/clinical-review/task/${task.id}`)

    return {
      success: true,
      newStatus: updatedTask.status,
      newVersion: updatedTask.version,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Karar kaydedilirken beklenmeyen bir hata oluştu.',
    }
  }
}

export async function saveDraftDecisionAction(
  taskId: string,
  expectedVersion: number,
  formData: FormData,
): Promise<DecisionActionResult> {
  try {
    assertClinicalReviewEnabled()
    const session = await requireVerifiedReviewer()

    const task = await getClinicalReviewTaskById(db, taskId)
    if (!task) {
      return { success: false, error: 'İnceleme görevi bulunamadı.' }
    }

    const decision = (formData.get('decision') as string) || 'approve'
    const severity = (formData.get('severity') as string) || null
    const evidenceStrength = (formData.get('evidenceStrength') as string) || null
    const approvedTargetKey = (formData.get('approvedTargetKey') as string)?.trim() || null
    const approvedAction = (formData.get('approvedAction') as string)?.trim() || null
    const titleTr = (formData.get('titleTr') as string)?.trim() || null
    const clinicalEffectTr = (formData.get('clinicalEffectTr') as string)?.trim() || null
    const mechanismTr = (formData.get('mechanismTr') as string)?.trim() || null
    const recommendationTr = (formData.get('recommendationTr') as string)?.trim() || null
    const attributionConfirmed = formData.get('attributionConfirmed') === 'true'
    const rejectReason = (formData.get('rejectReason') as string) || null
    const reviewNote = (formData.get('reviewNote') as string)?.trim() || null

    const draftId = `crd_draft_${crypto.randomUUID().replace(/-/g, '').slice(0, 18)}`
    await saveClinicalReviewDecision(db, {
      id: draftId,
      taskId: task.id,
      reviewerUserId: session.user.id,
      decision: (decision || 'defer') as 'approve' | 'reject' | 'defer' | 'needs_more_evidence',
      severity,
      evidenceStrength,
      approvedTargetKey,
      approvedAction,
      titleTr,
      clinicalEffectTr,
      mechanismTr,
      recommendationTr,
      attributionConfirmed,
      rejectReason,
      reviewNote,
      candidateSemanticHash: task.candidateSemanticHash,
      isDraft: true,
    })

    revalidatePath(`/clinical-review/task/${task.id}`)
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Taslak kaydedilemedi.',
    }
  }
}

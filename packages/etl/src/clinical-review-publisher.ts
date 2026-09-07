import { and, eq, inArray, sql } from 'drizzle-orm'
import type { Database } from '@ogun/db'
import {
  clinicalInteractionEvidence,
  clinicalInteractions,
  clinicalReviewAuditLog,
  clinicalReviewTasks,
  clinicalSources,
  clinicalTargetConcepts,
  medicationSubstances,
  nutrients,
} from '@ogun/db/schema'
import {
  getClinicalReviewDecisions,
  getClinicalReviewerWithCapabilities,
  getClinicalReviewTaskById,
  insertClinicalReviewAuditLog,
  updateClinicalReviewTaskStatus,
  type ClinicalProfessionalRole,
  type ClinicalReviewerCapability,
  type ClinicalReviewerVerificationStatus,
} from '@ogun/db/queries'
import {
  evaluateTaskConsensus,
  type ClinicalReviewerContext,
  type TaskConsensusResult,
} from './clinical-review-policy'
import {
  resolveApprovedTargetKey,
  type ClinicalTargetResolution,
} from './clinical-interaction-targets'
import {
  buildApprovedClinicalInteractionRecord,
  buildClinicalInteractionEvidenceRecord,
  OPENFDA_CLINICAL_SOURCE_ID,
  stableClinicalEvidenceId,
  stableClinicalInteractionId,
} from './importers/clinical-interactions'
import { representativeEvidence } from './clinical-review-pack'
import { createClinicalReviewArtifactStore } from './clinical-review-artifact-store'
import type { CandidateDetailBundle } from './clinical-review-web-bundle'
import type { OpenFdaCandidateEvidence } from './openfda-types'

export interface PublishValidationResult {
  valid: boolean
  reason?: string
  alreadyPublished?: boolean
  interactionId?: string
  task?: any
  consensus?: TaskConsensusResult
  target?: NonNullable<ReturnType<typeof resolveApprovedTargetKey>>
  bundle?: CandidateDetailBundle
  approvalDecision?: any
}

export interface PublishActionResult {
  success: boolean
  interactionId: string
  alreadyPublished?: boolean
  error?: string
}

/**
 * Validates a clinical review task against the canonical publishing criteria.
 * Shared between web portal admin actions, API gates, and CLI publishers.
 */
export async function validateTaskForPublishing(
  db: Database,
  taskId: string,
): Promise<PublishValidationResult> {
  // 1. Fetch task
  const task = await getClinicalReviewTaskById(db, taskId)
  if (!task) {
    return { valid: false, reason: `Task ${taskId} not found.` }
  }

  const interactionId = stableClinicalInteractionId(task.candidateId)

  // Idempotency check: if already published, no-op
  if (task.status === 'published') {
    return {
      valid: true,
      alreadyPublished: true,
      interactionId,
      task,
    }
  }

  // 2. Fetch all completed decisions
  const decisions = await getClinicalReviewDecisions(db, task.id, false)
  if (decisions.length === 0) {
    return { valid: false, reason: 'No completed reviews submitted for this task.' }
  }

  // 3. Assemble reviewer contexts
  const reviewersById = new Map<string, ClinicalReviewerContext>()
  for (const dec of decisions) {
    const p = await getClinicalReviewerWithCapabilities(db, dec.reviewerUserId)
    if (p) {
      reviewersById.set(dec.reviewerUserId, {
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

  // 4. Run consensus evaluation
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
    decisions: decisions.map((d) => ({
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
    reviewersById,
  })

  if (!consensus.readyToPublish) {
    return {
      valid: false,
      reason: `Consensus safety requirements not met: ${consensus.reasons.join('; ')}`,
      consensus,
    }
  }

  const primaryApproval = consensus.approvals[0]
  if (!primaryApproval) {
    return { valid: false, reason: 'No approved decision found in consensus approvals.' }
  }

  // 5. Target resolution
  const targetKey = primaryApproval.approvedTargetKey || task.targetKey
  const targetResolution = resolveApprovedTargetKey(targetKey)
  if (!targetResolution) {
    return { valid: false, reason: `Target '${targetKey}' could not be resolved in clinical taxonomy.` }
  }

  // 6. Verify evidence in artifact store (fail-closed integrity check)
  const store = createClinicalReviewArtifactStore()
  const bundle = await store.getCandidateDetail(task.candidateId, task.candidateSemanticHash)
  if (!bundle || bundle.evidenceList.length === 0) {
    return {
      valid: false,
      reason: `Evidence payload unavailable in artifact store for candidate ${task.candidateId}.`,
    }
  }

  return {
    valid: true,
    task,
    consensus,
    target: targetResolution,
    bundle,
    approvalDecision: primaryApproval,
    interactionId,
  }
}

/**
 * Transactionally publishes a clinically reviewed interaction to clinical_interactions.
 * Enforces publisher authorization, canonical validation, and audit trail.
 */
export async function publishReviewedClinicalInteraction(
  db: Database,
  options: {
    taskId: string
    publisherUserId: string
  },
): Promise<PublishActionResult> {
  const { taskId, publisherUserId } = options

  // 1. Publisher authorization gate (Section 27)
  const publisherProfile = await getClinicalReviewerWithCapabilities(db, publisherUserId)
  if (
    !publisherProfile ||
    publisherProfile.professionalRole !== 'clinical_admin' ||
    publisherProfile.verificationStatus !== 'verified' ||
    !publisherProfile.isActive ||
    !publisherProfile.canPublish
  ) {
    throw new Error(
      'Publishing authorization denied: Actor must be an active, verified clinical_admin with can_publish=true privilege.',
    )
  }

  // 2. Canonical validation gate (Section 25 & 26)
  const validation = await validateTaskForPublishing(db, taskId)
  if (!validation.valid) {
    throw new Error(`Task publication failed validation: ${validation.reason}`)
  }

  if (validation.alreadyPublished) {
    return {
      success: true,
      interactionId: validation.interactionId!,
      alreadyPublished: true,
    }
  }

  const { task, target, bundle, approvalDecision, interactionId } = validation
  const approval = approvalDecision!
  const targetResolution = target!

  // 3. Atomic Transactional Publish (Section 27)
  return db.transaction(async (tx) => {
    // 3a. Ensure clinical source registration
    await tx
      .insert(clinicalSources)
      .values({
        id: OPENFDA_CLINICAL_SOURCE_ID,
        code: OPENFDA_CLINICAL_SOURCE_ID,
        name: 'openFDA Drug Product Labels',
        citation: 'FDA approved drug product label package inserts (Structured Product Labeling)',
      })
      .onConflictDoNothing({ target: clinicalSources.id })

    // 3b. Resolve nutrient or clinical target concept
    let nutrientId: string | null = null
    let clinicalTargetConceptId: string | null = null

    if (targetResolution.kind === 'nutrient') {
      const [nutrientRow] = await tx
        .select({ id: nutrients.id })
        .from(nutrients)
        .where(eq(nutrients.code, targetResolution.nutrientCode))
        .limit(1)

      if (!nutrientRow) {
        throw new Error(`Nutrient with code '${targetResolution.nutrientCode}' not found in database.`)
      }
      nutrientId = nutrientRow.id
    } else {
      clinicalTargetConceptId = targetResolution.clinicalTarget.id
      await tx
        .insert(clinicalTargetConcepts)
        .values(targetResolution.clinicalTarget)
        .onConflictDoNothing({ target: clinicalTargetConcepts.id })
    }

    // 3c. Select representative evidence
    const bestEvidence =
      bundle!.representativeEvidence ||
      representativeEvidence(bundle!.evidenceList) ||
      bundle!.evidenceList[0]

    if (!bestEvidence) {
      throw new Error(`No valid evidence available for candidate ${task.candidateId}`)
    }

    // 3d. Build canonical interaction record
    const interactionValues = buildApprovedClinicalInteractionRecord({
      approval: {
        candidate: {
          id: task.candidateId,
          medicationSubstanceId: task.medicationSubstanceId!,
          beforeMinutes: null,
          afterMinutes: null,
        } as any,
        decision: 'approve',
        severity: approval.severity,
        evidenceStrength: approval.evidenceStrength,
        approvedAction: approval.approvedAction || task.action,
        approvedTargetKey: approval.approvedTargetKey || task.targetKey,
        titleTr: approval.titleTr,
        clinicalEffectTr: approval.clinicalEffectTr,
        mechanismTr: approval.mechanismTr,
        recommendationTr: approval.recommendationTr,
        acceptedAttributionRisk: Boolean(approval.attributionConfirmed),
        reviewer: publisherProfile.userName,
        reviewedAt: new Date(),
        reviewNote: approval.reviewNote,
        evidence: bundle!.evidenceList,
      },
      candidateSemanticHash: task.candidateSemanticHash,
      targetType: targetResolution.targetType,
      nutrientId,
      clinicalTargetConceptId,
    })

    // 3e. Insert or update clinical_interactions
    await tx
      .insert(clinicalInteractions)
      .values(interactionValues)
      .onConflictDoUpdate({
        target: clinicalInteractions.id,
        set: {
          targetType: interactionValues.targetType,
          nutrientId: interactionValues.nutrientId,
          clinicalTargetConceptId: interactionValues.clinicalTargetConceptId,
          action: interactionValues.action,
          severity: interactionValues.severity,
          evidenceStrength: interactionValues.evidenceStrength,
          titleTr: interactionValues.titleTr,
          clinicalEffectTr: interactionValues.clinicalEffectTr,
          mechanismTr: interactionValues.mechanismTr,
          recommendationTr: interactionValues.recommendationTr,
          status: 'published',
          reviewStatus: 'approved',
          reviewedBy: interactionValues.reviewedBy,
          reviewedAt: interactionValues.reviewedAt,
          updatedAt: new Date(),
        },
      })

    // 3f. Insert clinical_interaction_evidence
    const evidenceValues = buildClinicalInteractionEvidenceRecord({
      interactionId: interactionValues.id,
      evidence: bestEvidence,
      evidenceStrength: interactionValues.evidenceStrength,
    })

    await tx
      .insert(clinicalInteractionEvidence)
      .values(evidenceValues)
      .onConflictDoNothing({ target: clinicalInteractionEvidence.id })

    // 3g. Update task status to 'published'
    await tx
      .update(clinicalReviewTasks)
      .set({
        status: 'published',
        version: task.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(clinicalReviewTasks.id, task.id))

    // 3h. Record append-only audit log
    const auditId = `cral_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`
    await tx.insert(clinicalReviewAuditLog).values({
      id: auditId,
      taskId: task.id,
      actorUserId: publisherUserId,
      eventType: 'published',
      fromStatus: task.status,
      toStatus: 'published',
      compactChangeSummary: `Admin ${publisherProfile.userName} published interaction ${interactionValues.id} into clinical_interactions`,
    })

    return {
      success: true,
      interactionId: interactionValues.id,
    }
  })
}

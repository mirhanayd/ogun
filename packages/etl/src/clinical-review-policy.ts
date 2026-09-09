import type {
  ClinicalProfessionalRole,
  ClinicalReviewerCapability,
  ClinicalReviewerVerificationStatus,
} from '@ogun/db/queries'

export interface ClinicalReviewerContext {
  userId: string
  role: ClinicalProfessionalRole
  specialty?: string | null
  verificationStatus: ClinicalReviewerVerificationStatus
  isActive: boolean
  canPublish: boolean
  capabilities: readonly ClinicalReviewerCapability[]
}

export interface ReviewPolicyRequirements {
  requiredReviewCount: number
  primaryEligibleRoles: readonly ClinicalProfessionalRole[]
  coReviewEligibleRoles: readonly ClinicalProfessionalRole[]
  requiredCapabilities: readonly ClinicalReviewerCapability[]
  allowDietitianSolePrimary: boolean
  requiresAttributionConfirmation: boolean
  requiresDualReviewForAttribution: boolean
}

export interface CandidateTaskContext {
  id: string
  status: string
  subjectType: 'medication' | 'condition'
  targetType: string
  action: string
  ingredientAttribution?: string | null
  requiredCapability: string
  candidateSemanticHash: string
}

export interface RecordedDecision {
  id: string
  reviewerUserId: string
  decision: 'approve' | 'reject' | 'defer' | 'needs_more_evidence'
  severity?: string | null
  evidenceStrength?: string | null
  approvedTargetKey?: string | null
  approvedAction?: string | null
  titleTr?: string | null
  clinicalEffectTr?: string | null
  mechanismTr?: string | null
  recommendationTr?: string | null
  attributionConfirmed?: boolean | null
  rejectReason?: string | null
  reviewNote?: string | null
  candidateSemanticHash: string
  isDraft: boolean
}

export interface TaskConsensusResult {
  status:
    | 'pending'
    | 'in_review'
    | 'needs_resolution'
    | 'needs_more_evidence'
    | 'rejected'
    | 'deferred'
    | 'ready_to_publish'
    | 'source_changed'
  readyToPublish: boolean
  reasons: string[]
  completedReviewCount: number
  approvals: RecordedDecision[]
  rejections: RecordedDecision[]
  needsMoreEvidenceDecisions: RecordedDecision[]
  defers: RecordedDecision[]
}

export const CLINICAL_REVIEW_ASSIGNABLE_STATUSES = [
  'pending',
  'assigned',
  'in_review',
  'needs_more_evidence',
  'deferred',
  'source_changed',
] as const

/** Single source of truth for whether a task may receive a new assignment. */
export function isClinicalReviewTaskAssignable(status: string): boolean {
  return (CLINICAL_REVIEW_ASSIGNABLE_STATUSES as readonly string[]).includes(status)
}

const ATTRIBUTION_RISKS = new Set(['multi_ingredient_unattributed', 'secondary_match_uncertain'])

const HIGH_CRITICAL_SEVERITIES = new Set(['high', 'critical'])

/**
 * Validates whether an authenticated user is currently an active, verified clinical reviewer.
 */
export function isReviewerEligibleToReview(reviewer: ClinicalReviewerContext): boolean {
  return reviewer.verificationStatus === 'verified' && reviewer.isActive === true
}

/**
 * Calculates the required policy constraints for a review task based on subject, target, and attribution risk.
 */
export function determineRequiredReviewPolicy(
  task: Pick<
    CandidateTaskContext,
    'subjectType' | 'targetType' | 'action' | 'ingredientAttribution' | 'requiredCapability'
  >,
): ReviewPolicyRequirements {
  const hasAttributionRisk = ATTRIBUTION_RISKS.has(task.ingredientAttribution ?? '')
  const requiredCaps = [task.requiredCapability as ClinicalReviewerCapability]

  if (task.subjectType === 'condition') {
    return {
      requiredReviewCount: 1,
      primaryEligibleRoles: ['dietitian', 'physician', 'clinical_admin'],
      coReviewEligibleRoles: ['dietitian', 'physician', 'pharmacist'],
      requiredCapabilities: requiredCaps,
      allowDietitianSolePrimary: true,
      requiresAttributionConfirmation: false,
      requiresDualReviewForAttribution: false,
    }
  }

  // Medication interactions (Medication ↔ Food / Supplement / Meal Timing)
  // V1 policy: Primary pharmacological approval requires pharmacist or physician.
  return {
    requiredReviewCount: hasAttributionRisk ? 2 : 1,
    primaryEligibleRoles: ['pharmacist', 'physician', 'clinical_admin'],
    coReviewEligibleRoles: ['dietitian', 'pharmacist', 'physician'],
    requiredCapabilities: requiredCaps,
    allowDietitianSolePrimary: false,
    requiresAttributionConfirmation: hasAttributionRisk,
    requiresDualReviewForAttribution: hasAttributionRisk,
  }
}

/**
 * Checks whether a specific reviewer is eligible to review a task in either primary or co-review role.
 */
export function isReviewerEligibleForTask(
  reviewer: ClinicalReviewerContext,
  task: Pick<CandidateTaskContext, 'subjectType' | 'targetType' | 'action' | 'requiredCapability'>,
  roleType: 'primary' | 'co_review' = 'primary',
): { eligible: boolean; reason?: string } {
  if (!isReviewerEligibleToReview(reviewer)) {
    return {
      eligible: false,
      reason: `Reviewer is not verified or inactive (status: ${reviewer.verificationStatus}, active: ${reviewer.isActive})`,
    }
  }

  const policy = determineRequiredReviewPolicy(task)

  // Capability check
  const hasRequiredCapability =
    reviewer.capabilities.includes(task.requiredCapability as ClinicalReviewerCapability) ||
    reviewer.capabilities.includes('general_clinical')
  if (!hasRequiredCapability) {
    return {
      eligible: false,
      reason: `Reviewer lacks required capability: ${task.requiredCapability}`,
    }
  }

  if (roleType === 'primary') {
    if (!policy.primaryEligibleRoles.includes(reviewer.role)) {
      if (reviewer.role === 'dietitian' && !policy.allowDietitianSolePrimary) {
        return {
          eligible: false,
          reason:
            'Dietitian cannot be sole primary pharmacological reviewer for medication interaction candidate.',
        }
      }
      return {
        eligible: false,
        reason: `Role ${reviewer.role} is not eligible as primary reviewer for this task type.`,
      }
    }
  } else {
    if (!policy.coReviewEligibleRoles.includes(reviewer.role)) {
      return {
        eligible: false,
        reason: `Role ${reviewer.role} is not eligible as co-reviewer for this task type.`,
      }
    }
  }

  return { eligible: true }
}

/**
 * Evaluates the full decision consensus and readiness to publish of a task according to clinical review safety rules.
 */
export function evaluateTaskConsensus(options: {
  task: CandidateTaskContext
  decisions: RecordedDecision[]
  reviewersById: Map<string, ClinicalReviewerContext>
}): TaskConsensusResult {
  const { task, decisions, reviewersById } = options
  const reasons: string[] = []

  // Check 1: Stale source snapshot
  if (task.status === 'source_changed') {
    return {
      status: 'source_changed',
      readyToPublish: false,
      reasons: ['Source candidate semantic hash changed. Re-review required.'],
      completedReviewCount: 0,
      approvals: [],
      rejections: [],
      needsMoreEvidenceDecisions: [],
      defers: [],
    }
  }

  const activeDecisions = decisions.filter((d) => !d.isDraft)
  const approvals = activeDecisions.filter((d) => d.decision === 'approve')
  const rejections = activeDecisions.filter((d) => d.decision === 'reject')
  const needsMoreEvidenceDecisions = activeDecisions.filter(
    (d) => d.decision === 'needs_more_evidence',
  )
  const defers = activeDecisions.filter((d) => d.decision === 'defer')

  if (activeDecisions.length === 0) {
    return {
      status: 'pending',
      readyToPublish: false,
      reasons: ['No completed reviews recorded yet.'],
      completedReviewCount: 0,
      approvals: [],
      rejections: [],
      needsMoreEvidenceDecisions: [],
      defers: [],
    }
  }

  // Check 2: Semantic hash match for all decisions
  for (const d of activeDecisions) {
    if (d.candidateSemanticHash !== task.candidateSemanticHash) {
      reasons.push(
        `Decision by ${d.reviewerUserId} has stale semantic hash (${d.candidateSemanticHash} != ${task.candidateSemanticHash})`,
      )
    }
  }

  // Check 3: Check for explicit rejections
  if (rejections.length > 0 && approvals.length === 0) {
    return {
      status: 'rejected',
      readyToPublish: false,
      reasons: rejections.map((r) => r.reviewNote || r.rejectReason || 'Rejected by reviewer'),
      completedReviewCount: activeDecisions.length,
      approvals,
      rejections,
      needsMoreEvidenceDecisions,
      defers,
    }
  }

  // Check 4: Check for needs more evidence
  if (needsMoreEvidenceDecisions.length > 0 && approvals.length === 0) {
    return {
      status: 'needs_more_evidence',
      readyToPublish: false,
      reasons: needsMoreEvidenceDecisions.map(
        (n) => n.reviewNote || 'Reviewer requested more clinical evidence',
      ),
      completedReviewCount: activeDecisions.length,
      approvals,
      rejections,
      needsMoreEvidenceDecisions,
      defers,
    }
  }

  // Check 5: Conflict / Disagreement between reviewers
  if (approvals.length > 0 && rejections.length > 0) {
    return {
      status: 'needs_resolution',
      readyToPublish: false,
      reasons: [
        'Conflicting decisions: task has both approvals and rejections. Clinical resolution required.',
      ],
      completedReviewCount: activeDecisions.length,
      approvals,
      rejections,
      needsMoreEvidenceDecisions,
      defers,
    }
  }

  if (approvals.length === 0) {
    return {
      status: 'in_review',
      readyToPublish: false,
      reasons: ['Task is deferred or in review with no approvals.'],
      completedReviewCount: activeDecisions.length,
      approvals,
      rejections,
      needsMoreEvidenceDecisions,
      defers,
    }
  }

  // We have approvals! Check all clinical approval requirements
  const policy = determineRequiredReviewPolicy(task)

  // Check unique distinct reviewers
  const distinctReviewerIds = new Set(approvals.map((a) => a.reviewerUserId))
  if (distinctReviewerIds.size < approvals.length) {
    reasons.push('Duplicate approvals detected from the same reviewer.')
  }

  // Check high / critical severity requirement
  const hasHighOrCritical = approvals.some((a) => HIGH_CRITICAL_SEVERITIES.has(a.severity ?? ''))
  const minRequiredCount = hasHighOrCritical
    ? Math.max(policy.requiredReviewCount, 2)
    : policy.requiredReviewCount

  if (distinctReviewerIds.size < minRequiredCount) {
    reasons.push(
      hasHighOrCritical
        ? `High/Critical severity interaction requires at least 2 distinct eligible reviewers (currently ${distinctReviewerIds.size}).`
        : `Task requires at least ${minRequiredCount} distinct eligible reviewer(s) (currently ${distinctReviewerIds.size}).`,
    )
  }

  // Check reviewer qualifications and role distribution
  let hasEligiblePrimaryApproval = false
  for (const approval of approvals) {
    const reviewer = reviewersById.get(approval.reviewerUserId)
    if (!reviewer) {
      reasons.push(`Reviewer profile not found: ${approval.reviewerUserId}`)
      continue
    }

    if (!isReviewerEligibleToReview(reviewer)) {
      reasons.push(
        `Reviewer ${reviewer.userId} is not active and verified (status: ${reviewer.verificationStatus}, active: ${reviewer.isActive}).`,
      )
      continue
    }

    const primaryCheck = isReviewerEligibleForTask(reviewer, task, 'primary')
    if (primaryCheck.eligible) {
      hasEligiblePrimaryApproval = true
    }

    // Check mandatory fields on approval
    if (!approval.severity) {
      reasons.push(`Approval from ${reviewer.userId} is missing clinical severity.`)
    }
    if (!approval.evidenceStrength) {
      reasons.push(`Approval from ${reviewer.userId} is missing evidence strength.`)
    }
    if (!approval.approvedTargetKey) {
      reasons.push(`Approval from ${reviewer.userId} is missing approved target key.`)
    }
    if (!approval.approvedAction) {
      reasons.push(`Approval from ${reviewer.userId} is missing approved action.`)
    }

    // Check attribution confirmation if required
    if (policy.requiresAttributionConfirmation && !approval.attributionConfirmed) {
      reasons.push(
        `Attribution risk task requires explicit attribution confirmation by reviewer ${reviewer.userId}.`,
      )
    }
  }

  if (!hasEligiblePrimaryApproval) {
    reasons.push(
      task.subjectType === 'medication'
        ? 'Medication interaction requires at least one primary pharmacological approval from a verified pharmacist or physician.'
        : 'Condition interaction requires at least one primary approval from a verified dietitian or physician.',
    )
  }

  // Check consensus on key fields if multiple approvals
  if (approvals.length > 1) {
    const actions = new Set(approvals.map((a) => a.approvedAction).filter(Boolean))
    const targets = new Set(approvals.map((a) => a.approvedTargetKey).filter(Boolean))
    if (actions.size > 1) {
      return {
        status: 'needs_resolution',
        readyToPublish: false,
        reasons: ['Approving reviewers selected conflicting approved actions.'],
        completedReviewCount: activeDecisions.length,
        approvals,
        rejections,
        needsMoreEvidenceDecisions,
        defers,
      }
    }
    if (targets.size > 1) {
      return {
        status: 'needs_resolution',
        readyToPublish: false,
        reasons: ['Approving reviewers selected conflicting target keys.'],
        completedReviewCount: activeDecisions.length,
        approvals,
        rejections,
        needsMoreEvidenceDecisions,
        defers,
      }
    }
  }

  const readyToPublish = reasons.length === 0

  return {
    status: readyToPublish ? 'ready_to_publish' : 'in_review',
    readyToPublish,
    reasons,
    completedReviewCount: activeDecisions.length,
    approvals,
    rejections,
    needsMoreEvidenceDecisions,
    defers,
  }
}

import { readFileSync } from 'node:fs'
import Papa from 'papaparse'
import { resolveApprovedTargetKey } from './clinical-interaction-targets'
import type {
  OpenFdaCandidateAction,
  OpenFdaCandidateEvidence,
  OpenFdaInteractionCandidate,
} from './openfda-types'

export const CLINICAL_REVIEW_DECISIONS = [
  'approve',
  'reject',
  'defer',
  'needs_more_evidence',
] as const
export const CLINICAL_INTERACTION_SEVERITIES = [
  'info',
  'low',
  'moderate',
  'high',
  'critical',
] as const
export const CLINICAL_EVIDENCE_STRENGTHS = [
  'strong',
  'moderate',
  'limited',
  'expert_consensus',
  'unknown',
] as const
export const CLINICAL_INTERACTION_ACTIONS = [
  'avoid',
  'limit',
  'caution',
  'monitor',
  'consistency',
  'separate_timing',
  'take_with_food',
  'take_without_food',
  'avoid_alcohol',
  'individualize',
] as const

export type ClinicalReviewDecision = (typeof CLINICAL_REVIEW_DECISIONS)[number]
export type ClinicalInteractionSeverity = (typeof CLINICAL_INTERACTION_SEVERITIES)[number]
export type ClinicalEvidenceStrength = (typeof CLINICAL_EVIDENCE_STRENGTHS)[number]

export type ClinicalReviewDecisionRow = {
  candidate_id: string
  candidate_semantic_hash: string
  decision: string
  reviewer: string
  reviewed_at: string
  severity: string
  evidence_strength: string
  approved_target_key: string
  approved_action: string
  accept_attribution_risk: string
  title_tr: string
  clinical_effect_tr: string
  mechanism_tr: string
  recommendation_tr: string
  review_note: string
}

export type ValidatedClinicalReviewDecision = {
  candidate: OpenFdaInteractionCandidate
  evidence: OpenFdaCandidateEvidence[]
  decision: ClinicalReviewDecision
  reviewer: string | null
  reviewedAt: Date | null
  severity: ClinicalInteractionSeverity | null
  evidenceStrength: ClinicalEvidenceStrength | null
  approvedTargetKey: string | null
  approvedAction: OpenFdaCandidateAction | null
  acceptedAttributionRisk: boolean
  titleTr: string | null
  clinicalEffectTr: string | null
  mechanismTr: string | null
  recommendationTr: string | null
  reviewNote: string | null
}

const REQUIRED_COLUMNS = [
  'candidate_id',
  'candidate_semantic_hash',
  'decision',
  'reviewer',
  'reviewed_at',
  'severity',
  'evidence_strength',
  'approved_target_key',
  'approved_action',
  'accept_attribution_risk',
  'title_tr',
  'clinical_effect_tr',
  'mechanism_tr',
  'recommendation_tr',
  'review_note',
] as const

const FORBIDDEN_REVIEWERS = new Set(['ai', 'agent', 'system', 'automation', 'bot'])
const UNSAFE_ATTRIBUTIONS = new Set([
  'multi_ingredient_unattributed',
  'secondary_match_uncertain',
])

function optional(value: string) {
  const trimmed = value.trim()
  return trimmed || null
}

export function parseClinicalReviewDecisions(csv: string): ClinicalReviewDecisionRow[] {
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.trim(),
  })
  if (parsed.errors.length > 0) {
    throw new Error(`Review decision CSV parse error: ${parsed.errors[0]!.message}`)
  }
  const fields = new Set(parsed.meta.fields ?? [])
  const missing = REQUIRED_COLUMNS.filter((column) => !fields.has(column))
  if (missing.length > 0) throw new Error(`Review decision CSV missing columns: ${missing.join(',')}`)
  return parsed.data.map((row) =>
    Object.fromEntries(REQUIRED_COLUMNS.map((column) => [column, row[column] ?? ''])),
  ) as ClinicalReviewDecisionRow[]
}

export function loadClinicalReviewDecisions(filePath: string) {
  return parseClinicalReviewDecisions(readFileSync(filePath, 'utf8'))
}

export function validateClinicalReviewDecisions(options: {
  rows: ClinicalReviewDecisionRow[]
  candidates: OpenFdaInteractionCandidate[]
  evidence: OpenFdaCandidateEvidence[]
  candidateSemanticHash: string
  verifiedMedicationSubstanceIds: ReadonlySet<string>
}) {
  const candidatesById = new Map(options.candidates.map((candidate) => [candidate.id, candidate]))
  const evidenceByCandidate = new Map<string, OpenFdaCandidateEvidence[]>()
  for (const item of options.evidence) {
    const values = evidenceByCandidate.get(item.candidateId) ?? []
    values.push(item)
    evidenceByCandidate.set(item.candidateId, values)
  }
  const seen = new Set<string>()
  const decisions: ValidatedClinicalReviewDecision[] = []
  for (const row of options.rows) {
    const candidateId = row.candidate_id.trim()
    if (!candidateId) throw new Error('Review decision candidate_id is required')
    if (seen.has(candidateId)) throw new Error(`Duplicate review decision: ${candidateId}`)
    seen.add(candidateId)
    const candidate = candidatesById.get(candidateId)
    if (!candidate) throw new Error(`Review decision candidate does not exist: ${candidateId}`)
    if (row.candidate_semantic_hash.trim() !== options.candidateSemanticHash) {
      throw new Error(`Stale candidate semantic hash: ${candidateId}`)
    }
    if (!CLINICAL_REVIEW_DECISIONS.includes(row.decision.trim() as ClinicalReviewDecision)) {
      throw new Error(`Invalid review decision: ${candidateId}`)
    }
    const decision = row.decision.trim() as ClinicalReviewDecision
    const candidateEvidence = evidenceByCandidate.get(candidateId) ?? []
    if (candidateEvidence.length === 0) throw new Error(`Candidate evidence missing: ${candidateId}`)

    const reviewer = optional(row.reviewer)
    const reviewedAtText = optional(row.reviewed_at)
    const reviewedAt = reviewedAtText ? new Date(reviewedAtText) : null
    if (reviewedAt && Number.isNaN(reviewedAt.getTime())) {
      throw new Error(`Invalid reviewed_at: ${candidateId}`)
    }
    const acceptedAttributionRisk = row.accept_attribution_risk.trim().toLowerCase() === 'true'
    let severity: ClinicalInteractionSeverity | null = null
    let evidenceStrength: ClinicalEvidenceStrength | null = null
    let approvedTargetKey: string | null = null
    let approvedAction: OpenFdaCandidateAction | null = null

    if (decision === 'approve') {
      if (!reviewer) throw new Error(`Approve requires reviewer: ${candidateId}`)
      if (FORBIDDEN_REVIEWERS.has(reviewer.toLowerCase())) {
        throw new Error(`Approve reviewer must be an explicit human: ${candidateId}`)
      }
      if (!reviewedAt) throw new Error(`Approve requires reviewed_at: ${candidateId}`)
      if (!options.verifiedMedicationSubstanceIds.has(candidate.medicationSubstanceId)) {
        throw new Error(`Unverified medication substance: ${candidateId}`)
      }
      if (!CLINICAL_INTERACTION_SEVERITIES.includes(row.severity.trim() as ClinicalInteractionSeverity)) {
        throw new Error(`Invalid severity: ${candidateId}`)
      }
      severity = row.severity.trim() as ClinicalInteractionSeverity
      if (
        !CLINICAL_EVIDENCE_STRENGTHS.includes(
          row.evidence_strength.trim() as ClinicalEvidenceStrength,
        )
      ) {
        throw new Error(`Invalid evidence strength: ${candidateId}`)
      }
      evidenceStrength = row.evidence_strength.trim() as ClinicalEvidenceStrength
      approvedTargetKey = optional(row.approved_target_key)
      if (!approvedTargetKey || !resolveApprovedTargetKey(approvedTargetKey)) {
        throw new Error(`Unresolved approved target: ${candidateId}`)
      }
      if (!CLINICAL_INTERACTION_ACTIONS.includes(row.approved_action.trim() as OpenFdaCandidateAction)) {
        throw new Error(`Invalid approved action: ${candidateId}`)
      }
      approvedAction = row.approved_action.trim() as OpenFdaCandidateAction
      if (
        UNSAFE_ATTRIBUTIONS.has(candidate.ingredientAttribution) &&
        (!acceptedAttributionRisk || !optional(row.review_note))
      ) {
        throw new Error(`Attribution risk requires explicit acceptance and note: ${candidateId}`)
      }
    }

    decisions.push({
      candidate,
      evidence: candidateEvidence,
      decision,
      reviewer,
      reviewedAt,
      severity,
      evidenceStrength,
      approvedTargetKey,
      approvedAction,
      acceptedAttributionRisk,
      titleTr: optional(row.title_tr),
      clinicalEffectTr: optional(row.clinical_effect_tr),
      mechanismTr: optional(row.mechanism_tr),
      recommendationTr: optional(row.recommendation_tr),
      reviewNote: optional(row.review_note),
    })
  }
  return decisions
}

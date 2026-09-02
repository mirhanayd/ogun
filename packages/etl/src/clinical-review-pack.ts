import { createHash } from 'node:crypto'
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import Papa from 'papaparse'
import { resolveClinicalInteractionTarget } from './clinical-interaction-targets'
import type {
  OpenFdaCandidateEvidence,
  OpenFdaInteractionCandidate,
} from './openfda-types'
import type { OpenFdaExtractionSummary } from './openfda-review-export'

export const CLINICAL_REVIEW_PRIORITIES = ['P1', 'P2', 'P3', 'P4', 'P5'] as const
export type ClinicalReviewPriority = (typeof CLINICAL_REVIEW_PRIORITIES)[number]

const SAFE_ATTRIBUTIONS = new Set([
  'direct_single_ingredient',
  'direct_substance_section',
  'multi_ingredient_attributable',
])

export function clinicalReviewPriority(
  candidate: OpenFdaInteractionCandidate,
): ClinicalReviewPriority {
  if (
    candidate.ingredientAttribution === 'multi_ingredient_unattributed' ||
    candidate.ingredientAttribution === 'secondary_match_uncertain'
  ) {
    return 'P5'
  }
  if (candidate.candidateConfidence === 'low') return 'P4'
  if (candidate.candidateConfidence === 'high' && SAFE_ATTRIBUTIONS.has(candidate.ingredientAttribution)) {
    return 'P1'
  }
  if (
    candidate.targetType === 'meal_timing' ||
    (candidate.targetType === 'nutrient' && candidate.action === 'separate_timing')
  ) {
    return 'P3'
  }
  return 'P2'
}

const SECTION_RANK: Record<string, number> = {
  drug_interactions: 0,
  dosage_and_administration: 1,
  warnings_and_cautions: 2,
  warnings: 3,
  information_for_patients: 4,
  clinical_pharmacology: 5,
  pharmacokinetics: 6,
}

const CONFIDENCE_RANK = { high: 0, medium: 1, low: 2 } as const

export function representativeEvidence(items: OpenFdaCandidateEvidence[]) {
  return [...items].sort((left, right) => {
    return (
      Number(left.evidenceVersionStatus === 'historical') -
        Number(right.evidenceVersionStatus === 'historical') ||
      CONFIDENCE_RANK[left.confidence] - CONFIDENCE_RANK[right.confidence] ||
      (SECTION_RANK[left.matchedSection] ?? 99) - (SECTION_RANK[right.matchedSection] ?? 99) ||
      left.id.localeCompare(right.id)
    )
  })[0]
}

function atomicWrite(destination: string, contents: string) {
  const temporary = `${destination}.tmp`
  writeFileSync(temporary, contents)
  renameSync(temporary, destination)
}

export function prepareClinicalReviewPack(options: {
  candidates: OpenFdaInteractionCandidate[]
  evidence: OpenFdaCandidateEvidence[]
  summary: OpenFdaExtractionSummary
  outputDir: string
}) {
  const semanticHash = createHash('sha256')
    .update(JSON.stringify(options.candidates))
    .update('\0')
    .update(JSON.stringify(options.evidence))
    .digest('hex')
  if (semanticHash !== options.summary.extraction.semanticHash) {
    throw new Error('Candidate semantic hash does not match extraction summary')
  }

  const evidenceByCandidate = new Map<string, OpenFdaCandidateEvidence[]>()
  for (const item of options.evidence) {
    const values = evidenceByCandidate.get(item.candidateId) ?? []
    values.push(item)
    evidenceByCandidate.set(item.candidateId, values)
  }

  const rows = options.candidates.map((candidate) => {
    const evidence = evidenceByCandidate.get(candidate.id) ?? []
    const best = representativeEvidence(evidence)
    if (!best) throw new Error(`Candidate has no evidence: ${candidate.id}`)
    const target = resolveClinicalInteractionTarget(candidate.targetType, candidate.target)
    const priority = clinicalReviewPriority(candidate)
    return {
      candidate_id: candidate.id,
      candidate_semantic_hash: semanticHash,
      medication_substance_id: candidate.medicationSubstanceId,
      ogun_substance: candidate.canonicalName,
      rxcui: candidate.rxcui,
      target_type: candidate.targetType,
      candidate_target: candidate.target,
      resolved_target_key: target.targetKey ?? '',
      target_resolution: target.status,
      action: candidate.action,
      candidate_confidence: candidate.candidateConfidence,
      ingredient_attribution: candidate.ingredientAttribution,
      fda_section: best.matchedSection,
      representative_evidence: best.evidenceSnippet,
      evidence_count: candidate.evidenceCount,
      source_document_count: new Set(evidence.map((item) => item.splSetId)).size,
      spl_count: new Set(evidence.map((item) => item.splSetId)).size,
      source_locator: `openfda:${best.splSetId}:${best.effectiveTime ?? ''}:${best.matchedSection}:${best.labelPartitionFile}`,
      suggested_review_priority: priority,
    }
  })

  const definitions = {
    P1: 'P1-high-direct.csv',
    P2: 'P2-medium-direct.csv',
    P3: 'P3-timing.csv',
    P4: 'P4-low.csv',
    P5: 'P5-attribution-risk.csv',
  } as const
  mkdirSync(options.outputDir, { recursive: true })
  const files = {} as Record<ClinicalReviewPriority, string>
  const counts = {} as Record<ClinicalReviewPriority, number>
  for (const priority of CLINICAL_REVIEW_PRIORITIES) {
    const destination = path.join(options.outputDir, definitions[priority])
    const queue = rows.filter((row) => row.suggested_review_priority === priority)
    atomicWrite(destination, `${Papa.unparse(queue, { newline: '\n' })}\n`)
    files[priority] = destination
    counts[priority] = queue.length
  }
  const result = {
    candidateSemanticHash: semanticHash,
    candidates: rows.length,
    counts,
    files,
    clinicalSeveritySuggested: false,
    clinicalRecommendationSuggested: false,
  }
  atomicWrite(
    path.join(options.outputDir, 'clinical-review-pack-summary.json'),
    `${JSON.stringify(result, null, 2)}\n`,
  )
  return result
}

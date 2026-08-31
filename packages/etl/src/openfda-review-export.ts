import { createHash } from 'node:crypto'
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import Papa from 'papaparse'
import type {
  OpenFdaCandidateAction,
  OpenFdaCandidateEvidence,
  OpenFdaInteractionCandidate,
  OpenFdaTargetType,
} from './openfda-types'
import type { OpenFdaIngredientAttribution } from './openfda-ingredient-attribution'

export type OpenFdaExtractionSummary = {
  extractionVersion: string
  sourceLastUpdated: string | null
  labelExportDate: string | null
  retrievedAt: string
  manifestPartitions: number
  availablePartitions: number
  missingPartitions: string[]
  partialCoverage: boolean
  verifiedRxNormSeeds: number
  processedLabelRecords: number
  matchedLabels: number
  matchedSubstances: number
  relevantSections: number
  candidateObservations: number
  logicalCandidates: number
  evidenceRecords: number
  targetTypeCounts: Record<OpenFdaTargetType, number>
  actionCounts: Record<OpenFdaCandidateAction, number>
  confidenceCounts: Record<'high' | 'medium' | 'low', number>
  attributionCounts: Record<OpenFdaIngredientAttribution, number>
  globalDuplicatesCollapsed: number
  latestEvidenceRecords: number
  historicalEvidenceRecords: number
  verifiedSeedCoverage: {
    exactRxCui: number
    exactSubstanceName: number
    secondary: number
    noMatch: number
  }
  openfda: {
    manifestUrl: string
    manifestLastUpdated: string | null
    drugLabelExportDate: string | null
    partitionCount: number
    expectedTotalRecords: number
    parsedTotalRecords: number
    manifestSha256: string
    partitionSha256: Record<string, string>
  }
  rxnorm: {
    verifiedSeedCount: number
    verifiedSeedSha256: string
    rxnormVersion: string
  }
  extraction: {
    extractorVersion: string
    semanticHash: string
  }
}

export const OPENFDA_CANDIDATE_FILE = 'openfda_candidate_interactions.jsonl.gz'
export const OPENFDA_EVIDENCE_FILE = 'openfda_candidate_evidence.jsonl.gz'
export const OPENFDA_SUMMARY_FILE = 'openfda_candidate_summary.json'

function atomicWrite(destination: string, contents: string | Buffer) {
  const temporary = `${destination}.tmp`
  writeFileSync(temporary, contents)
  renameSync(temporary, destination)
}

function jsonlGzip(rows: unknown[]) {
  const jsonl = rows.map((row) => JSON.stringify(row)).join('\n')
  return gzipSync(jsonl ? `${jsonl}\n` : '', { level: 9 })
}

function reviewRow(
  candidate: OpenFdaInteractionCandidate,
  evidenceByCandidate: Map<string, OpenFdaCandidateEvidence[]>,
) {
  const evidence = evidenceByCandidate.get(candidate.id) ?? []
  const first = evidence[0]
  return {
    candidate_id: candidate.id,
    medication_substance_id: candidate.medicationSubstanceId,
    canonical_name: candidate.canonicalName,
    rxcui: candidate.rxcui,
    target_type: candidate.targetType,
    target: candidate.target,
    action: candidate.action,
    qualifier: candidate.qualifier ?? '',
    before_minutes: candidate.beforeMinutes ?? '',
    after_minutes: candidate.afterMinutes ?? '',
    confidence: candidate.candidateConfidence,
    ingredient_attribution: candidate.ingredientAttribution,
    evidence_count: candidate.evidenceCount,
    latest_evidence_count: candidate.latestEvidenceCount,
    historical_evidence_count: candidate.historicalEvidenceCount,
    source_partition_count: candidate.sourcePartitionCount,
    matched_section: first?.matchedSection ?? '',
    evidence_snippet: first?.evidenceSnippet ?? '',
    spl_set_id: first?.splSetId ?? '',
    review_status: 'review_required',
    production_status: 'not_for_production',
  }
}

function writeCsv(destination: string, rows: Array<Record<string, unknown>>) {
  atomicWrite(destination, `${Papa.unparse(rows, { newline: '\n' })}\n`)
}

export function writeOpenFdaReviewArtifacts(
  candidates: OpenFdaInteractionCandidate[],
  evidence: OpenFdaCandidateEvidence[],
  summary: OpenFdaExtractionSummary,
  extractedDir: string,
  reviewDir: string,
) {
  mkdirSync(extractedDir, { recursive: true })
  mkdirSync(reviewDir, { recursive: true })
  const candidatePath = path.join(extractedDir, OPENFDA_CANDIDATE_FILE)
  const evidencePath = path.join(extractedDir, OPENFDA_EVIDENCE_FILE)
  const summaryPath = path.join(extractedDir, OPENFDA_SUMMARY_FILE)
  const outputHash = createHash('sha256')
    .update(JSON.stringify(candidates))
    .update('\0')
    .update(JSON.stringify(evidence))
    .digest('hex')
  summary.extraction.semanticHash = outputHash
  atomicWrite(candidatePath, jsonlGzip(candidates))
  atomicWrite(evidencePath, jsonlGzip(evidence))
  atomicWrite(summaryPath, `${JSON.stringify(summary, null, 2)}\n`)

  const evidenceByCandidate = new Map<string, OpenFdaCandidateEvidence[]>()
  for (const item of evidence) {
    const values = evidenceByCandidate.get(item.candidateId) ?? []
    values.push(item)
    evidenceByCandidate.set(item.candidateId, values)
  }
  const rows = candidates.map((candidate) => reviewRow(candidate, evidenceByCandidate))
  const queues = {
    highPriority: rows.filter(
      (_, index) =>
        candidates[index]!.candidateConfidence === 'high' &&
        !['multi_ingredient_unattributed', 'secondary_match_uncertain'].includes(
          candidates[index]!.ingredientAttribution,
        ),
    ),
    timing: rows.filter((_, index) => candidates[index]!.targetType === 'meal_timing'),
    foodComponent: rows.filter((_, index) =>
      ['nutrient', 'food_component', 'supplement'].includes(candidates[index]!.targetType),
    ),
    alcohol: rows.filter((_, index) => candidates[index]!.targetType === 'alcohol'),
    multiIngredient: rows.filter((_, index) =>
      candidates[index]!.ingredientAttribution.startsWith('multi_ingredient_'),
    ),
    attributionUncertain: rows.filter((_, index) =>
      ['multi_ingredient_unattributed', 'secondary_match_uncertain'].includes(
        candidates[index]!.ingredientAttribution,
      ),
    ),
    lowConfidence: rows.filter((_, index) => candidates[index]!.candidateConfidence === 'low'),
  }
  const reviewPaths = {
    highPriority: path.join(reviewDir, 'openfda_high_priority_review.csv'),
    timing: path.join(reviewDir, 'openfda_timing_review.csv'),
    foodComponent: path.join(reviewDir, 'openfda_food_component_review.csv'),
    alcohol: path.join(reviewDir, 'openfda_alcohol_review.csv'),
    multiIngredient: path.join(reviewDir, 'openfda_multi_ingredient_review.csv'),
    attributionUncertain: path.join(reviewDir, 'openfda_attribution_uncertain_review.csv'),
    lowConfidence: path.join(reviewDir, 'openfda_low_confidence_review.csv'),
  }
  writeCsv(reviewPaths.highPriority, queues.highPriority)
  writeCsv(reviewPaths.timing, queues.timing)
  writeCsv(reviewPaths.foodComponent, queues.foodComponent)
  writeCsv(reviewPaths.alcohol, queues.alcohol)
  writeCsv(reviewPaths.multiIngredient, queues.multiIngredient)
  writeCsv(reviewPaths.attributionUncertain, queues.attributionUncertain)
  writeCsv(reviewPaths.lowConfidence, queues.lowConfidence)

  return {
    candidatePath,
    evidencePath,
    summaryPath,
    reviewPaths,
    reviewCounts: Object.fromEntries(
      Object.entries(queues).map(([queue, queueRows]) => [queue, queueRows.length]),
    ),
    outputHash,
  }
}

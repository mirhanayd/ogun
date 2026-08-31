import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { sql } from 'drizzle-orm'
import { verifyOpenFdaCandidateIsolation } from '@ogun/db/queries'
import { OPENFDA_ALLOWED_TARGETS } from './openfda-target-vocabulary'
import {
  isUnsafeOpenFdaAttribution,
  OPENFDA_INGREDIENT_ATTRIBUTIONS,
} from './openfda-ingredient-attribution'
import {
  OPENFDA_CANDIDATE_FILE,
  OPENFDA_EVIDENCE_FILE,
  OPENFDA_SUMMARY_FILE,
  type OpenFdaExtractionSummary,
} from './openfda-review-export'
import type {
  OpenFdaCandidateAction,
  OpenFdaCandidateEvidence,
  OpenFdaInteractionCandidate,
} from './openfda-types'
import { loadVerifiedRxNormSeeds } from './openfda-verified-filter'
import {
  DATABASE_HARD_LIMIT_BYTES,
  DATABASE_WARNING_BYTES,
  evaluateClinicalDatabaseFootprint,
} from './verify-rxnorm-size'

const ALLOWED_ACTIONS = new Set<OpenFdaCandidateAction>([
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
])
const ALLOWED_ATTRIBUTIONS = new Set(OPENFDA_INGREDIENT_ATTRIBUTIONS)

function readGzipJsonl<T>(filePath: string): T[] {
  const contents = gunzipSync(readFileSync(filePath)).toString('utf8')
  return contents
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T)
}

function logicalKey(candidate: OpenFdaInteractionCandidate) {
  return [
    candidate.medicationSubstanceId,
    candidate.target,
    candidate.action,
    candidate.qualifier ?? '',
    candidate.beforeMinutes ?? '',
    candidate.afterMinutes ?? '',
    candidate.extractionReason,
  ].join('\0')
}

export function validateOpenFdaCandidateArtifacts(
  candidates: OpenFdaInteractionCandidate[],
  evidence: OpenFdaCandidateEvidence[],
  summary: OpenFdaExtractionSummary,
  verifiedSubstanceIds: ReadonlySet<string>,
) {
  const errors: string[] = []
  const candidateIds = new Set<string>()
  const logicalKeys = new Set<string>()
  for (const candidate of candidates) {
    if (candidateIds.has(candidate.id)) errors.push(`duplicate_candidate_id:${candidate.id}`)
    candidateIds.add(candidate.id)
    const key = logicalKey(candidate)
    if (logicalKeys.has(key)) errors.push(`duplicate_logical_candidate:${candidate.id}`)
    logicalKeys.add(key)
    if (!verifiedSubstanceIds.has(candidate.medicationSubstanceId)) {
      errors.push(`unverified_subject:${candidate.medicationSubstanceId}`)
    }
    if (!OPENFDA_ALLOWED_TARGETS.has(candidate.target))
      errors.push(`unknown_target:${candidate.target}`)
    if (!ALLOWED_ACTIONS.has(candidate.action)) errors.push(`unknown_action:${candidate.action}`)
    if (!ALLOWED_ATTRIBUTIONS.has(candidate.ingredientAttribution)) {
      errors.push(`unknown_attribution:${candidate.id}`)
    }
    if (
      isUnsafeOpenFdaAttribution(candidate.ingredientAttribution) &&
      candidate.candidateConfidence === 'high'
    ) {
      errors.push(`unsafe_high_confidence:${candidate.id}`)
    }
    if (
      candidate.status !== 'candidate' ||
      candidate.reviewRequired !== true ||
      candidate.notForProduction !== true ||
      candidate.clinicalRecommendation !== null
    ) {
      errors.push(`production_isolation:${candidate.id}`)
    }
  }

  const evidenceIds = new Set<string>()
  const evidenceCountByCandidate = new Map<string, number>()
  const latestCountByCandidate = new Map<string, number>()
  const historicalCountByCandidate = new Map<string, number>()
  const partitionsByCandidate = new Map<string, Set<string>>()
  for (const item of evidence) {
    if (evidenceIds.has(item.id)) errors.push(`duplicate_evidence_id:${item.id}`)
    evidenceIds.add(item.id)
    if (!candidateIds.has(item.candidateId)) errors.push(`orphan_evidence:${item.id}`)
    if (item.sourceSystem !== 'openfda') errors.push(`invalid_source:${item.id}`)
    if (!ALLOWED_ATTRIBUTIONS.has(item.ingredientAttribution)) {
      errors.push(`unknown_evidence_attribution:${item.id}`)
    }
    if (!item.splSetId || !item.recordHash || !item.labelPartitionFile) {
      errors.push(`missing_provenance:${item.id}`)
    }
    if (item.evidenceSnippet.length > 480) errors.push(`long_evidence:${item.id}`)
    if (!['latest', 'historical'].includes(item.evidenceVersionStatus)) {
      errors.push(`invalid_evidence_version_status:${item.id}`)
    }
    evidenceCountByCandidate.set(
      item.candidateId,
      (evidenceCountByCandidate.get(item.candidateId) ?? 0) + 1,
    )
    const versionCounts =
      item.evidenceVersionStatus === 'latest' ? latestCountByCandidate : historicalCountByCandidate
    versionCounts.set(item.candidateId, (versionCounts.get(item.candidateId) ?? 0) + 1)
    const partitions = partitionsByCandidate.get(item.candidateId) ?? new Set<string>()
    partitions.add(item.labelPartitionFile)
    partitionsByCandidate.set(item.candidateId, partitions)
  }
  for (const candidate of candidates) {
    if ((evidenceCountByCandidate.get(candidate.id) ?? 0) !== candidate.evidenceCount) {
      errors.push(`evidence_count_mismatch:${candidate.id}`)
    }
    if ((latestCountByCandidate.get(candidate.id) ?? 0) !== candidate.latestEvidenceCount) {
      errors.push(`latest_evidence_count_mismatch:${candidate.id}`)
    }
    if ((historicalCountByCandidate.get(candidate.id) ?? 0) !== candidate.historicalEvidenceCount) {
      errors.push(`historical_evidence_count_mismatch:${candidate.id}`)
    }
    if ((partitionsByCandidate.get(candidate.id)?.size ?? 0) !== candidate.sourcePartitionCount) {
      errors.push(`source_partition_count_mismatch:${candidate.id}`)
    }
  }
  if (summary.logicalCandidates !== candidates.length) errors.push('summary_candidate_count')
  if (summary.evidenceRecords !== evidence.length) errors.push('summary_evidence_count')
  if (summary.availablePartitions === 0) errors.push('no_available_partitions')
  if (summary.partialCoverage !== summary.missingPartitions.length > 0) {
    errors.push('coverage_flag_mismatch')
  }
  const semanticHash = createHash('sha256')
    .update(JSON.stringify(candidates))
    .update('\0')
    .update(JSON.stringify(evidence))
    .digest('hex')
  if (summary.extraction.semanticHash !== semanticHash) errors.push('summary_semantic_hash')
  if (
    summary.openfda.parsedTotalRecords !== summary.openfda.expectedTotalRecords ||
    summary.openfda.partitionCount !== summary.availablePartitions ||
    summary.partialCoverage
  ) {
    errors.push('full_corpus_coverage')
  }
  if (summary.rxnorm.verifiedSeedCount !== verifiedSubstanceIds.size) {
    errors.push('verified_seed_count')
  }
  return {
    status: errors.length === 0 ? ('PASS' as const) : ('FAIL' as const),
    errors,
    candidates: candidates.length,
    evidence: evidence.length,
    semanticHash,
  }
}

export async function verifyOpenFdaCandidates(options: {
  extractedDir: string
  skipDatabase?: boolean
}) {
  const candidatePath = path.join(options.extractedDir, OPENFDA_CANDIDATE_FILE)
  const evidencePath = path.join(options.extractedDir, OPENFDA_EVIDENCE_FILE)
  const summaryPath = path.join(options.extractedDir, OPENFDA_SUMMARY_FILE)
  const candidates = readGzipJsonl<OpenFdaInteractionCandidate>(candidatePath)
  const evidence = readGzipJsonl<OpenFdaCandidateEvidence>(evidencePath)
  const summary = JSON.parse(readFileSync(summaryPath, 'utf8')) as OpenFdaExtractionSummary
  const seeds = loadVerifiedRxNormSeeds()
  const artifacts = validateOpenFdaCandidateArtifacts(
    candidates,
    evidence,
    summary,
    new Set(seeds.map((seed) => seed.medicationSubstanceId)),
  )
  if (artifacts.status !== 'PASS') {
    throw new Error(`openFDA candidate artifact verification failed: ${artifacts.errors.join(',')}`)
  }

  let database = null
  if (!options.skipDatabase) {
    const { db } = await import('@ogun/db')
    try {
      const [sizeRows, isolation] = await Promise.all([
        db.execute(sql`
          select pg_database_size(current_database())::bigint as database_bytes,
            0::bigint as mapping_table_bytes,
            0::bigint as mapping_index_bytes
        `),
        verifyOpenFdaCandidateIsolation(db),
      ])
      const footprint = evaluateClinicalDatabaseFootprint(
        (sizeRows as Array<Record<string, unknown>>)[0] ?? {},
      )
      if (footprint.databaseBytes >= DATABASE_WARNING_BYTES) {
        throw new Error('DB 900 MiB warning eşiğinde; openFDA candidate pipeline durduruldu')
      }
      if (footprint.databaseBytes > DATABASE_HARD_LIMIT_BYTES || !isolation.isolated) {
        throw new Error('openFDA candidate DB isolation/hard limit ihlali')
      }
      database = { footprint, isolation }
    } finally {
      await db.$client.end()
    }
  }
  return { artifacts, summary, database }
}

async function main() {
  const argument = process.argv.slice(2).find((item) => item.startsWith('--dir='))
  const extractedDir = path.resolve(
    argument?.slice('--dir='.length) ??
      path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '../data/clinical/openfda/extracted',
      ),
  )
  console.log(
    JSON.stringify(
      await verifyOpenFdaCandidates({
        extractedDir,
        skipDatabase: process.argv.includes('--skip-db'),
      }),
      null,
      2,
    ),
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}

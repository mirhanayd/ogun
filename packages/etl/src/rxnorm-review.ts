import { createReadStream, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { createGunzip } from 'node:zlib'
import Papa from 'papaparse'
import type { PreparedMapping, SubstanceIdentity } from './rxnorm-mapping'

type CandidateAlternative = {
  source_phrase: string
  rank: number
  rxcui: string
  rxnorm_name: string
  rxnorm_tty: string
  score: number
  matched_alias: string
  is_atc_bridge: boolean
}

export type ReviewQueue =
  'high_confidence_review' | 'atc_supported_review' | 'manual_review' | 'unmapped'

export type ReviewExportRow = {
  review_queue: ReviewQueue
  review_status: 'pending'
  medication_substance_id: string
  substance_name: string
  raw_source_phrase: string
  candidate_term: string
  rxcui: string
  rxnorm_tty: string
  match_method: string
  confidence: string
  atc_name: string
  atc_support_count: string
  atc_total_count: string
  atc_dominance: string
  alternatives_json: string
  ambiguity_reason: string
  canonical_join: string
  combination_intact: 'true' | 'false'
}

async function readAlternatives(packageDir: string) {
  const byPhrase = new Map<string, CandidateAlternative[]>()
  const input = createReadStream(
    path.join(packageDir, 'titck_rxnorm_mapping_candidates.jsonl.gz'),
  ).pipe(createGunzip())
  const lines = readline.createInterface({ input, crlfDelay: Infinity })
  for await (const line of lines) {
    if (!line.trim()) continue
    const candidate = JSON.parse(line) as CandidateAlternative
    const alternatives = byPhrase.get(candidate.source_phrase) ?? []
    alternatives.push(candidate)
    byPhrase.set(candidate.source_phrase, alternatives)
  }
  for (const alternatives of byPhrase.values()) {
    alternatives.sort((a, b) => a.rank - b.rank || b.score - a.score)
  }
  return byPhrase
}

function queueFor(item: PreparedMapping): ReviewQueue {
  if (item.resolution.kind !== 'resolved') {
    return item.resolution.kind === 'ambiguous' ? 'manual_review' : 'unmapped'
  }
  if (item.row.review_tier === 'unmapped') return 'unmapped'
  if (
    item.row.review_tier === 'high_confidence_review' ||
    item.row.review_tier === 'atc_supported_review' ||
    item.row.review_tier === 'manual_review'
  ) {
    return item.row.review_tier
  }
  throw new Error(`Bilinmeyen review_tier: ${item.row.review_tier}`)
}

function ambiguityReason(item: PreparedMapping) {
  if (item.resolution.kind === 'ambiguous') {
    return `canonical_join_multiple:${item.resolution.medicationSubstanceIds.join('|')}`
  }
  if (item.resolution.kind === 'unmapped') return 'canonical_join_not_found'
  if (item.row.review_tier === 'unmapped') return 'rxnorm_candidate_not_reliable'
  if (item.row.review_tier === 'manual_review') return 'automatic_acceptance_not_allowed'
  return ''
}

export async function buildReviewExports(
  prepared: PreparedMapping[],
  substances: SubstanceIdentity[],
  packageDir: string,
) {
  const alternatives = await readAlternatives(packageDir)
  const substanceNames = new Map(substances.map((substance) => [substance.id, substance.nameTr]))
  const queues: Record<ReviewQueue, ReviewExportRow[]> = {
    high_confidence_review: [],
    atc_supported_review: [],
    manual_review: [],
    unmapped: [],
  }

  for (const item of prepared) {
    const queue = queueFor(item)
    const medicationSubstanceId =
      item.resolution.kind === 'resolved' ? item.resolution.medicationSubstanceId : ''
    const compactAlternatives = (alternatives.get(item.row.source_phrase) ?? [])
      .slice(0, 5)
      .map((candidate) => ({
        rank: candidate.rank,
        rxcui: candidate.rxcui,
        term: candidate.rxnorm_name,
        tty: candidate.rxnorm_tty,
        score: candidate.score,
        atc: candidate.is_atc_bridge,
      }))
    queues[queue].push({
      review_queue: queue,
      review_status: 'pending',
      medication_substance_id: medicationSubstanceId,
      substance_name: substanceNames.get(medicationSubstanceId) ?? '',
      raw_source_phrase: item.row.source_phrase,
      candidate_term: item.row.best_rxnorm_name,
      rxcui: item.row.best_rxcui,
      rxnorm_tty: item.row.best_rxnorm_tty,
      match_method: item.row.match_method,
      confidence: item.row.lexical_score,
      atc_name: item.row.atc_name,
      atc_support_count: item.row.atc_support_count,
      atc_total_count: item.row.atc_total_count,
      atc_dominance: item.row.atc_dominance,
      alternatives_json: JSON.stringify(compactAlternatives),
      ambiguity_reason: ambiguityReason(item),
      canonical_join: item.resolution.kind === 'resolved' ? item.resolution.joinMethod : '',
      combination_intact: item.row.is_combination_hint === 'True' ? 'true' : 'false',
    })
  }

  return queues
}

export function writeReviewExports(
  queues: Record<ReviewQueue, ReviewExportRow[]>,
  outputDir: string,
) {
  mkdirSync(outputDir, { recursive: true })
  const counts = {} as Record<ReviewQueue, number>
  for (const [queue, rows] of Object.entries(queues) as Array<[ReviewQueue, ReviewExportRow[]]>) {
    const destination = path.join(outputDir, `${queue}.csv`)
    const temporary = `${destination}.tmp`
    writeFileSync(temporary, `${Papa.unparse(rows, { newline: '\n' })}\n`, 'utf8')
    renameSync(temporary, destination)
    counts[queue] = rows.length
  }
  return counts
}

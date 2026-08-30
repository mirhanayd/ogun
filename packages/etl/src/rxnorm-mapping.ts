import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Papa from 'papaparse'
import { normalizeSearchText } from './lib/normalize'

export const RXNORM_SOURCE_VERSION = '2026-08-03'
export const DEFAULT_RXNORM_PACKAGE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../data/clinical/rxnorm/ogun-rxnorm-mapping-v1',
)

export type MappingMethod =
  'lexical_exact' | 'normalized_exact' | 'token_exact' | 'atc_bridge' | 'fuzzy'

export type WorklistRow = {
  source_phrase: string
  source_occurrences: string
  normalized_source: string
  is_combination_hint: string
  is_complex_or_biologic_hint: string
  best_rxcui: string
  best_rxnorm_name: string
  best_rxnorm_tty: string
  match_method: string
  lexical_score: string
  score_margin: string
  atc_name: string
  atc_support_count: string
  atc_total_count: string
  atc_dominance: string
  atc_mapped_rxcui: string
  atc_mapping_kind: string
  review_tier: string
  publish_status: string
}

export type SubstanceIdentity = {
  id: string
  nameTr: string
  normalizedName: string
  searchText: string
  isCombination: boolean
}

export type SubstanceAliasIdentity = {
  medicationSubstanceId: string
  alias: string
  searchNormalized: string
}

export type CanonicalResolution =
  | { kind: 'resolved'; medicationSubstanceId: string; joinMethod: 'canonical_name' | 'alias' }
  | { kind: 'ambiguous'; medicationSubstanceIds: string[] }
  | { kind: 'unmapped' }

export type CandidateMapping = {
  id: string
  medicationSubstanceId: string
  system: 'RXNORM'
  externalId: string
  mappingStatus: 'candidate'
  matchMethod: MappingMethod
  confidence: number | null
  matchedTerm: string | null
  externalTermType: string | null
  sourceVersion: string
  sourcePhrase: string
  reviewTier: string
  joinMethod: 'canonical_name' | 'alias'
  isCombinationHint: boolean
}

export type PreparedMapping = {
  row: WorklistRow
  resolution: CanonicalResolution
  candidate: CandidateMapping | null
}

type Manifest = {
  inputs: Array<{ name: string; release?: string }>
  outputs: Array<{ name: string; size_bytes: number; sha256: string }>
}

function addIdentity(index: Map<string, Set<string>>, key: string, id: string) {
  const normalized = normalizeSearchText(key)
  if (!normalized) return
  const ids = index.get(normalized) ?? new Set<string>()
  ids.add(id)
  index.set(normalized, ids)
}

export function buildSubstanceResolver(
  substances: SubstanceIdentity[],
  aliases: SubstanceAliasIdentity[],
) {
  const canonicalIndex = new Map<string, Set<string>>()
  const aliasIndex = new Map<string, Set<string>>()

  for (const substance of substances) {
    addIdentity(canonicalIndex, substance.nameTr, substance.id)
    addIdentity(canonicalIndex, substance.normalizedName, substance.id)
    addIdentity(canonicalIndex, substance.searchText, substance.id)
  }
  for (const alias of aliases) {
    addIdentity(aliasIndex, alias.alias, alias.medicationSubstanceId)
    addIdentity(aliasIndex, alias.searchNormalized, alias.medicationSubstanceId)
  }

  return (sourcePhrase: string, _normalizedSource = ''): CanonicalResolution => {
    // `normalized_source` aday üreticisinin farmakolojik normalizasyonudur ve
    // tuz/form ayrıntısını silebilir. DB kimliği için yalnız ham ifadenin arama
    // normalizasyonu güvenlidir; aksi hâlde farklı canonical kayıtlar birleşebilir.
    const keys = new Set([normalizeSearchText(sourcePhrase)].filter((value) => value.length > 0))
    const canonicalIds = new Set<string>()
    const aliasIds = new Set<string>()
    for (const key of keys) {
      for (const id of canonicalIndex.get(key) ?? []) canonicalIds.add(id)
      for (const id of aliasIndex.get(key) ?? []) aliasIds.add(id)
    }

    if (canonicalIds.size === 1) {
      return {
        kind: 'resolved',
        medicationSubstanceId: [...canonicalIds][0]!,
        joinMethod: 'canonical_name',
      }
    }
    if (canonicalIds.size > 1) {
      return { kind: 'ambiguous', medicationSubstanceIds: [...canonicalIds].sort() }
    }
    if (aliasIds.size === 1) {
      return {
        kind: 'resolved',
        medicationSubstanceId: [...aliasIds][0]!,
        joinMethod: 'alias',
      }
    }
    if (aliasIds.size > 1) {
      return { kind: 'ambiguous', medicationSubstanceIds: [...aliasIds].sort() }
    }
    return { kind: 'unmapped' }
  }
}

export function mapMatchMethod(value: string): MappingMethod {
  const methods: Record<string, MappingMethod> = {
    lexical: 'lexical_exact',
    lexical_exact: 'lexical_exact',
    normalized: 'normalized_exact',
    normalized_exact: 'normalized_exact',
    token: 'token_exact',
    token_exact: 'token_exact',
    atc_bridge: 'atc_bridge',
    fuzzy: 'fuzzy',
  }
  const mapped = methods[value]
  if (!mapped) throw new Error(`Bilinmeyen RxNorm match_method: ${value}`)
  return mapped
}

export function deterministicMappingId(medicationSubstanceId: string, rxcui: string) {
  const digest = createHash('sha256')
    .update(`RXNORM\0${medicationSubstanceId}\0${rxcui}`)
    .digest('hex')
    .slice(0, 24)
  return `msm_${digest}`
}

function parseConfidence(value: string) {
  if (!value.trim()) return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new Error(`Geçersiz lexical_score: ${value}`)
  return Math.min(Math.max(parsed / 100, 0), 1)
}

export function prepareMappings(
  rows: WorklistRow[],
  resolveSubstance: (sourcePhrase: string, normalizedSource?: string) => CanonicalResolution,
): PreparedMapping[] {
  return rows.map((row) => {
    if (row.publish_status !== 'candidate_only') {
      throw new Error(`Güvenli olmayan publish_status: ${row.publish_status}`)
    }
    const resolution = resolveSubstance(row.source_phrase, row.normalized_source)
    if (resolution.kind !== 'resolved' || row.review_tier === 'unmapped' || !row.best_rxcui) {
      return { row, resolution, candidate: null }
    }

    return {
      row,
      resolution,
      candidate: {
        id: deterministicMappingId(resolution.medicationSubstanceId, row.best_rxcui),
        medicationSubstanceId: resolution.medicationSubstanceId,
        system: 'RXNORM',
        externalId: row.best_rxcui,
        mappingStatus: 'candidate',
        matchMethod: mapMatchMethod(row.match_method),
        confidence: parseConfidence(row.lexical_score),
        matchedTerm: row.best_rxnorm_name || null,
        externalTermType: row.best_rxnorm_tty || null,
        sourceVersion: RXNORM_SOURCE_VERSION,
        sourcePhrase: row.source_phrase,
        reviewTier: row.review_tier,
        joinMethod: resolution.joinMethod,
        isCombinationHint: row.is_combination_hint === 'True',
      },
    }
  })
}

const METHOD_STRENGTH: Record<MappingMethod, number> = {
  lexical_exact: 5,
  normalized_exact: 4,
  token_exact: 3,
  atc_bridge: 2,
  fuzzy: 1,
}

export function selectDeterministicCandidates(prepared: PreparedMapping[]) {
  const selected = new Map<string, CandidateMapping>()
  for (const item of prepared) {
    const candidate = item.candidate
    if (!candidate) continue
    const key = `${candidate.medicationSubstanceId}\0${candidate.externalId}`
    const current = selected.get(key)
    if (
      !current ||
      METHOD_STRENGTH[candidate.matchMethod] > METHOD_STRENGTH[current.matchMethod] ||
      (METHOD_STRENGTH[candidate.matchMethod] === METHOD_STRENGTH[current.matchMethod] &&
        (candidate.confidence ?? -1) > (current.confidence ?? -1)) ||
      (METHOD_STRENGTH[candidate.matchMethod] === METHOD_STRENGTH[current.matchMethod] &&
        candidate.confidence === current.confidence &&
        candidate.sourcePhrase.localeCompare(current.sourcePhrase, 'tr') < 0)
    ) {
      selected.set(key, candidate)
    }
  }
  return [...selected.values()].sort(
    (a, b) =>
      a.medicationSubstanceId.localeCompare(b.medicationSubstanceId) ||
      a.externalId.localeCompare(b.externalId, 'en', { numeric: true }),
  )
}

export function verifyRxNormPackage(packageDir = DEFAULT_RXNORM_PACKAGE_DIR) {
  const manifest = JSON.parse(
    readFileSync(path.join(packageDir, 'manifest.json'), 'utf8'),
  ) as Manifest
  for (const output of manifest.outputs) {
    const contents = readFileSync(path.join(packageDir, output.name))
    if (contents.byteLength !== output.size_bytes) {
      throw new Error(`${output.name}: boyut manifest ile eşleşmiyor`)
    }
    const actualHash = createHash('sha256').update(contents).digest('hex')
    if (actualHash !== output.sha256) {
      throw new Error(`${output.name}: SHA-256 manifest ile eşleşmiyor`)
    }
  }
  const release = manifest.inputs.find((input) => input.name.startsWith('RxNorm_'))?.release
  if (release !== RXNORM_SOURCE_VERSION) {
    throw new Error(`Beklenmeyen RxNorm release: ${release ?? 'yok'}`)
  }
  return manifest
}

export function loadWorklist(packageDir = DEFAULT_RXNORM_PACKAGE_DIR) {
  const csv = readFileSync(path.join(packageDir, 'titck_rxnorm_mapping_worklist.csv'), 'utf8')
  const parsed = Papa.parse<WorklistRow>(csv, {
    header: true,
    skipEmptyLines: true,
  })
  if (parsed.errors.length > 0) {
    const first = parsed.errors[0]!
    throw new Error(`Worklist CSV parse hatası (satır ${first.row ?? '?'}): ${first.message}`)
  }
  return parsed.data
}

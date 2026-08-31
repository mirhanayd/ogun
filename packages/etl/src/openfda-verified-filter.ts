import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { DEFAULT_VERIFIED_RXNORM_EXPORT_PATH } from './rxnorm-verified-export'
import type {
  OpenFdaLabelRecord,
  OpenFdaMatchTier,
  OpenFdaSubstanceMatch,
  VerifiedRxNormSeed,
} from './openfda-types'

type SeedExportRow = {
  medication_substance_id?: unknown
  canonical_name?: unknown
  rxcui?: unknown
  tty?: unknown
  source_version?: unknown
  [key: string]: unknown
}

const SEED_FIELDS = [
  'canonical_name',
  'medication_substance_id',
  'rxcui',
  'source_version',
  'tty',
]

export function normalizeOpenFdaName(value: string) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/\u0307/g, '')
    .replace(/[\p{P}\p{Z}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function exactName(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase('en-US').replace(/\u0307/g, '').trim()
}

function stringValues(value: unknown) {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : []
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

export function parseVerifiedRxNormSeeds(jsonl: string): VerifiedRxNormSeed[] {
  const seeds = jsonl
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line, index): VerifiedRxNormSeed => {
      const row = JSON.parse(line) as SeedExportRow
      const fields = Object.keys(row).sort()
      if (fields.join('|') !== SEED_FIELDS.join('|')) {
        throw new Error(`Verified RxNorm seed satır ${index + 1}: beklenmeyen alan`)
      }
      if (
        typeof row.medication_substance_id !== 'string' ||
        typeof row.canonical_name !== 'string' ||
        typeof row.rxcui !== 'string' ||
        !['IN', 'PIN', 'MIN'].includes(String(row.tty)) ||
        typeof row.source_version !== 'string'
      ) {
        throw new Error(`Verified RxNorm seed satır ${index + 1}: geçersiz kayıt`)
      }
      return {
        medicationSubstanceId: row.medication_substance_id,
        canonicalName: row.canonical_name,
        rxcui: row.rxcui,
        tty: row.tty as VerifiedRxNormSeed['tty'],
        sourceVersion: row.source_version,
      }
    })
  const substanceIds = new Set(seeds.map((seed) => seed.medicationSubstanceId))
  const rxcuis = new Set(seeds.map((seed) => seed.rxcui))
  if (substanceIds.size !== seeds.length || rxcuis.size !== seeds.length) {
    throw new Error('Verified RxNorm seed duplicate substance veya RxCUI içeriyor')
  }
  return seeds.sort((a, b) => a.medicationSubstanceId.localeCompare(b.medicationSubstanceId))
}

export function loadVerifiedRxNormSeeds(seedPath = DEFAULT_VERIFIED_RXNORM_EXPORT_PATH) {
  return parseVerifiedRxNormSeeds(gunzipSync(readFileSync(seedPath)).toString('utf8'))
}

function addIndex(index: Map<string, VerifiedRxNormSeed[]>, key: string, seed: VerifiedRxNormSeed) {
  if (!key) return
  const values = index.get(key) ?? []
  values.push(seed)
  index.set(key, values)
}

export function buildVerifiedRxNormIndex(seeds: VerifiedRxNormSeed[]) {
  const byRxCui = new Map<string, VerifiedRxNormSeed[]>()
  const byExactName = new Map<string, VerifiedRxNormSeed[]>()
  const byNormalizedName = new Map<string, VerifiedRxNormSeed[]>()
  for (const seed of seeds) {
    addIndex(byRxCui, seed.rxcui, seed)
    addIndex(byExactName, exactName(seed.canonicalName), seed)
    addIndex(byNormalizedName, normalizeOpenFdaName(seed.canonicalName), seed)
  }
  return { byRxCui, byExactName, byNormalizedName }
}

type VerifiedRxNormIndex = ReturnType<typeof buildVerifiedRxNormIndex>

export function matchOpenFdaLabel(
  record: OpenFdaLabelRecord,
  index: VerifiedRxNormIndex,
): OpenFdaSubstanceMatch[] {
  const matches = new Map<string, OpenFdaSubstanceMatch>()
  const collect = (
    values: string[],
    lookup: Map<string, VerifiedRxNormSeed[]>,
    key: (value: string) => string,
    tier: OpenFdaMatchTier,
    matchedField: OpenFdaSubstanceMatch['matchedField'],
  ) => {
    for (const value of values) {
      const seeds = lookup.get(key(value)) ?? []
      for (const seed of seeds) {
        if (matches.has(seed.medicationSubstanceId)) continue
        matches.set(seed.medicationSubstanceId, {
          seed,
          tier,
          matchedField,
          matchedValue: value,
          ambiguous: seeds.length > 1,
        })
      }
    }
  }

  const openfda = record.openfda ?? {}
  collect(
    stringValues(openfda.rxcui),
    index.byRxCui,
    (value) => value,
    'exact_rxcui_match',
    'openfda.rxcui',
  )
  collect(
    stringValues(openfda.substance_name),
    index.byExactName,
    exactName,
    'exact_substance_name_match',
    'openfda.substance_name',
  )
  collect(
    stringValues(openfda.substance_name),
    index.byNormalizedName,
    normalizeOpenFdaName,
    'normalized_substance_name_match',
    'openfda.substance_name',
  )
  collect(
    stringValues(openfda.generic_name),
    index.byNormalizedName,
    normalizeOpenFdaName,
    'secondary_generic_match',
    'openfda.generic_name',
  )
  return [...matches.values()].sort((a, b) =>
    a.seed.medicationSubstanceId.localeCompare(b.seed.medicationSubstanceId),
  )
}

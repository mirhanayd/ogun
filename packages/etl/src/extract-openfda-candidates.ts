import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { extractOpenFdaCandidateTriggers } from './openfda-candidate-extractor'
import { OpenFdaCandidateAccumulator } from './openfda-candidate-dedupe'
import { OPENFDA_INGREDIENT_ATTRIBUTIONS } from './openfda-ingredient-attribution'
import {
  assertCompleteOpenFdaCorpus,
  inspectOpenFdaCorpus,
  readPinnedOpenFdaCorpus,
} from './openfda-corpus-verifier'
import {
  DEFAULT_OPENFDA_LABEL_DIR,
  OPENFDA_DOWNLOAD_MANIFEST_URL,
  sha256File,
} from './openfda-label-downloader'
import { extractRelevantOpenFdaSections, streamOpenFdaPartition } from './openfda-label-reader'
import { type OpenFdaExtractionSummary, writeOpenFdaReviewArtifacts } from './openfda-review-export'
import { OPENFDA_EXTRACTION_VERSION } from './openfda-types'
import {
  buildVerifiedRxNormIndex,
  loadVerifiedRxNormSeeds,
  matchOpenFdaLabel,
} from './openfda-verified-filter'
import { DEFAULT_VERIFIED_RXNORM_EXPORT_PATH } from './rxnorm-verified-export'

function argumentValue(prefix: string) {
  return process.argv
    .slice(2)
    .find((argument) => argument.startsWith(prefix))
    ?.slice(prefix.length)
}

function initializeCounts<T extends string>(values: readonly T[]) {
  return Object.fromEntries(values.map((value) => [value, 0])) as Record<T, number>
}

function availablePartitionPath(labelDir: string, fileName: string, allowPartial: boolean) {
  const zipPath = path.join(labelDir, fileName)
  if (existsSync(zipPath)) return zipPath
  if (!allowPartial) return null
  const jsonPath = zipPath.replace(/\.zip$/, '')
  return existsSync(jsonPath) ? jsonPath : null
}

export async function extractOpenFdaCandidates(
  options: {
    labelDir?: string
    seedPath?: string
    extractedDir?: string
    reviewDir?: string
    allowPartial?: boolean
  } = {},
) {
  const labelDir = path.resolve(options.labelDir ?? DEFAULT_OPENFDA_LABEL_DIR)
  const seedPath = path.resolve(options.seedPath ?? DEFAULT_VERIFIED_RXNORM_EXPORT_PATH)
  const openFdaRoot = path.resolve(labelDir, '..')
  const extractedDir = path.resolve(options.extractedDir ?? path.join(openFdaRoot, 'extracted'))
  const reviewDir = path.resolve(options.reviewDir ?? path.join(openFdaRoot, 'review'))
  const allowPartial = options.allowPartial === true
  const { manifest, snapshot } = readPinnedOpenFdaCorpus(labelDir)
  const preflight = await inspectOpenFdaCorpus({
    labelDir,
    parseRecords: false,
    verifyHashes: true,
  })
  if (!allowPartial) assertCompleteOpenFdaCorpus(preflight)
  const seeds = loadVerifiedRxNormSeeds(seedPath)
  const seedIndex = buildVerifiedRxNormIndex(seeds)
  const available = manifest.files.flatMap((file) => {
    const filePath = availablePartitionPath(labelDir, file.fileName, allowPartial)
    return filePath ? [{ ...file, filePath }] : []
  })
  const missingPartitions = manifest.files
    .filter((file) => !availablePartitionPath(labelDir, file.fileName, allowPartial))
    .map((file) => file.fileName)
  if (available.length === 0) {
    throw new Error(`openFDA raw label partition yok; eksik=${missingPartitions.length}`)
  }

  const accumulator = new OpenFdaCandidateAccumulator()
  const matchedSubstances = new Set<string>()
  const bestMatchTierBySubstance = new Map<string, string>()
  const matchTierRank = {
    secondary_generic_match: 1,
    normalized_substance_name_match: 2,
    exact_substance_name_match: 3,
    exact_rxcui_match: 4,
  } as const
  let processedLabelRecords = 0
  let matchedLabels = 0
  let relevantSections = 0
  let candidateObservations = 0
  const parsedRecordsByPartition = new Map<string, number>()

  for (const partition of available) {
    if (partition.filePath.endsWith('.zip') && partition.sha256) {
      const actualHash = await sha256File(partition.filePath)
      if (actualHash !== partition.sha256) {
        throw new Error(`${partition.fileName}: local SHA-256 manifest ile eşleşmiyor`)
      }
    }
    for await (const { record, recordHash } of streamOpenFdaPartition(partition.filePath)) {
      processedLabelRecords += 1
      parsedRecordsByPartition.set(
        partition.fileName,
        (parsedRecordsByPartition.get(partition.fileName) ?? 0) + 1,
      )
      const matches = matchOpenFdaLabel(record, seedIndex)
      if (matches.length === 0) continue
      matchedLabels += 1
      for (const match of matches) {
        const substanceId = match.seed.medicationSubstanceId
        matchedSubstances.add(substanceId)
        const current = bestMatchTierBySubstance.get(substanceId) as
          keyof typeof matchTierRank | undefined
        if (!current || matchTierRank[match.tier] > matchTierRank[current]) {
          bestMatchTierBySubstance.set(substanceId, match.tier)
        }
      }
      const sections = extractRelevantOpenFdaSections(record)
      relevantSections += sections.length
      for (const section of sections) {
        const triggers = extractOpenFdaCandidateTriggers(section)
        for (const match of matches) {
          for (const trigger of triggers) {
            candidateObservations += 1
            accumulator.add({
              record,
              recordHash,
              partitionFile: partition.fileName,
              retrievedAt: manifest.fetchedAt,
              match,
              section,
              trigger,
            })
          }
        }
      }
    }
  }

  if (!allowPartial) {
    const mismatched = manifest.files.filter(
      (file) => parsedRecordsByPartition.get(file.fileName) !== file.records,
    )
    if (mismatched.length > 0 || processedLabelRecords !== manifest.totalRecords) {
      throw new Error(
        `openFDA full corpus parsed record mismatch: parsed=${processedLabelRecords} expected=${manifest.totalRecords} partitions=${mismatched.map((file) => file.fileName).join(',')}`,
      )
    }
  }

  const { candidates, evidence } = accumulator.result()
  const targetTypes = [
    'nutrient',
    'food_component',
    'food',
    'food_group',
    'supplement',
    'alcohol',
    'meal_timing',
  ] as const
  const actions = [
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
  const targetTypeCounts = initializeCounts(targetTypes)
  const actionCounts = initializeCounts(actions)
  const confidenceCounts = initializeCounts(['high', 'medium', 'low'] as const)
  const attributionCounts = initializeCounts(OPENFDA_INGREDIENT_ATTRIBUTIONS)
  for (const candidate of candidates) {
    targetTypeCounts[candidate.targetType] += 1
    actionCounts[candidate.action] += 1
    confidenceCounts[candidate.candidateConfidence] += 1
    attributionCounts[candidate.ingredientAttribution] += 1
  }
  const tierValues = [...bestMatchTierBySubstance.values()]
  const verifiedSeedCoverage = {
    exactRxCui: tierValues.filter((tier) => tier === 'exact_rxcui_match').length,
    exactSubstanceName: tierValues.filter((tier) => tier === 'exact_substance_name_match').length,
    secondary: tierValues.filter((tier) =>
      ['normalized_substance_name_match', 'secondary_generic_match'].includes(tier),
    ).length,
    noMatch: seeds.length - bestMatchTierBySubstance.size,
  }
  const verifiedSeedSha256 = await sha256File(seedPath)
  const rxnormVersion = [...new Set(seeds.map((seed) => seed.sourceVersion))].sort().join(',')
  const summary: OpenFdaExtractionSummary = {
    extractionVersion: OPENFDA_EXTRACTION_VERSION,
    sourceLastUpdated: manifest.sourceLastUpdated,
    labelExportDate: manifest.labelExportDate,
    retrievedAt: manifest.fetchedAt,
    manifestPartitions: manifest.files.length,
    availablePartitions: available.length,
    missingPartitions,
    partialCoverage: missingPartitions.length > 0,
    verifiedRxNormSeeds: seeds.length,
    processedLabelRecords,
    matchedLabels,
    matchedSubstances: matchedSubstances.size,
    relevantSections,
    candidateObservations,
    logicalCandidates: candidates.length,
    evidenceRecords: evidence.length,
    targetTypeCounts,
    actionCounts,
    confidenceCounts,
    attributionCounts,
    globalDuplicatesCollapsed: candidateObservations - candidates.length,
    latestEvidenceRecords: evidence.filter((item) => item.evidenceVersionStatus === 'latest')
      .length,
    historicalEvidenceRecords: evidence.filter(
      (item) => item.evidenceVersionStatus === 'historical',
    ).length,
    verifiedSeedCoverage,
    openfda: {
      manifestUrl: OPENFDA_DOWNLOAD_MANIFEST_URL,
      manifestLastUpdated: snapshot.sourceLastUpdated,
      drugLabelExportDate: snapshot.labelExportDate,
      partitionCount: snapshot.partitions.length,
      expectedTotalRecords: snapshot.totalRecords,
      parsedTotalRecords: processedLabelRecords,
      manifestSha256: snapshot.manifestSha256,
      partitionSha256: Object.fromEntries(
        manifest.files.map((file) => [file.fileName, file.sha256 ?? '']),
      ),
    },
    rxnorm: {
      verifiedSeedCount: seeds.length,
      verifiedSeedSha256,
      rxnormVersion,
    },
    extraction: {
      extractorVersion: OPENFDA_EXTRACTION_VERSION,
      semanticHash: '',
    },
  }
  const artifacts = writeOpenFdaReviewArtifacts(
    candidates,
    evidence,
    summary,
    extractedDir,
    reviewDir,
  )
  return { summary, artifacts }
}

async function main() {
  const result = await extractOpenFdaCandidates({
    labelDir: argumentValue('--dir='),
    seedPath: argumentValue('--seed='),
    extractedDir: argumentValue('--output-dir='),
    reviewDir: argumentValue('--review-dir='),
    allowPartial: process.argv.includes('--partial'),
  })
  console.log(JSON.stringify(result, null, 2))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}

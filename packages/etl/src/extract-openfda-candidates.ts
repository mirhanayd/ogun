import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { extractOpenFdaCandidateTriggers } from './openfda-candidate-extractor'
import { OpenFdaCandidateAccumulator } from './openfda-candidate-dedupe'
import { DEFAULT_OPENFDA_LABEL_DIR, sha256File } from './openfda-label-downloader'
import { extractRelevantOpenFdaSections, streamOpenFdaPartition } from './openfda-label-reader'
import { type OpenFdaExtractionSummary, writeOpenFdaReviewArtifacts } from './openfda-review-export'
import { OPENFDA_EXTRACTION_VERSION } from './openfda-types'
import {
  buildVerifiedRxNormIndex,
  loadVerifiedRxNormSeeds,
  matchOpenFdaLabel,
} from './openfda-verified-filter'
import { DEFAULT_VERIFIED_RXNORM_EXPORT_PATH } from './rxnorm-verified-export'

type LocalManifest = {
  schemaVersion: number
  sourceLastUpdated: string | null
  labelExportDate: string | null
  totalRecords: number
  fetchedAt: string
  rawStorage: string
  databaseImported: boolean
  files: Array<{
    fileName: string
    records: number
    status: string
    sha256?: string
  }>
}

function argumentValue(prefix: string) {
  return process.argv
    .slice(2)
    .find((argument) => argument.startsWith(prefix))
    ?.slice(prefix.length)
}

function initializeCounts<T extends string>(values: readonly T[]) {
  return Object.fromEntries(values.map((value) => [value, 0])) as Record<T, number>
}

function readManifest(labelDir: string) {
  const manifestPath = path.join(labelDir, 'download-manifest.json')
  if (!existsSync(manifestPath)) throw new Error('openFDA download manifest bulunamadı')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as LocalManifest
  if (
    manifest.schemaVersion !== 1 ||
    manifest.rawStorage !== 'filesystem-only' ||
    manifest.databaseImported !== false ||
    !Array.isArray(manifest.files)
  ) {
    throw new Error('openFDA local manifest güvenlik politikası geçersiz')
  }
  return manifest
}

function availablePartitionPath(labelDir: string, fileName: string) {
  const zipPath = path.join(labelDir, fileName)
  if (existsSync(zipPath)) return zipPath
  const jsonPath = zipPath.replace(/\.zip$/, '')
  return existsSync(jsonPath) ? jsonPath : null
}

export async function extractOpenFdaCandidates(
  options: {
    labelDir?: string
    seedPath?: string
    extractedDir?: string
    reviewDir?: string
  } = {},
) {
  const labelDir = path.resolve(options.labelDir ?? DEFAULT_OPENFDA_LABEL_DIR)
  const seedPath = path.resolve(options.seedPath ?? DEFAULT_VERIFIED_RXNORM_EXPORT_PATH)
  const openFdaRoot = path.resolve(labelDir, '..')
  const extractedDir = path.resolve(options.extractedDir ?? path.join(openFdaRoot, 'extracted'))
  const reviewDir = path.resolve(options.reviewDir ?? path.join(openFdaRoot, 'review'))
  const manifest = readManifest(labelDir)
  const seeds = loadVerifiedRxNormSeeds(seedPath)
  const seedIndex = buildVerifiedRxNormIndex(seeds)
  const available = manifest.files.flatMap((file) => {
    const filePath = availablePartitionPath(labelDir, file.fileName)
    return filePath ? [{ ...file, filePath }] : []
  })
  const missingPartitions = manifest.files
    .filter((file) => !availablePartitionPath(labelDir, file.fileName))
    .map((file) => file.fileName)
  if (available.length === 0) {
    throw new Error(`openFDA raw label partition yok; eksik=${missingPartitions.length}`)
  }

  const accumulator = new OpenFdaCandidateAccumulator()
  const matchedSubstances = new Set<string>()
  let processedLabelRecords = 0
  let matchedLabels = 0
  let relevantSections = 0
  let candidateObservations = 0

  for (const partition of available) {
    if (partition.filePath.endsWith('.zip') && partition.sha256) {
      const actualHash = await sha256File(partition.filePath)
      if (actualHash !== partition.sha256) {
        throw new Error(`${partition.fileName}: local SHA-256 manifest ile eşleşmiyor`)
      }
    }
    for await (const { record, recordHash } of streamOpenFdaPartition(partition.filePath)) {
      processedLabelRecords += 1
      const matches = matchOpenFdaLabel(record, seedIndex)
      if (matches.length === 0) continue
      matchedLabels += 1
      for (const match of matches) matchedSubstances.add(match.seed.medicationSubstanceId)
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
  for (const candidate of candidates) {
    targetTypeCounts[candidate.targetType] += 1
    actionCounts[candidate.action] += 1
    confidenceCounts[candidate.candidateConfidence] += 1
  }
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
  })
  console.log(JSON.stringify(result, null, 2))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}

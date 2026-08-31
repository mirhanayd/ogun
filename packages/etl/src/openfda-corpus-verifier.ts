import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  DEFAULT_OPENFDA_LABEL_DIR,
  sha256File,
  verifyPinnedOpenFdaManifest,
  type LocalOpenFdaManifest,
  type PinnedOpenFdaManifest,
} from './openfda-label-downloader'
import { streamOpenFdaPartition } from './openfda-label-reader'

export type OpenFdaPartitionInspection = {
  fileName: string
  exists: boolean
  status: string
  pinnedExportDate: string | null
  bytesMatch: boolean
  sha256Match: boolean
  parseable: boolean | null
  parsedRecords: number | null
  error: string | null
}

export type OpenFdaCorpusCoverageReport = {
  status: 'PASS' | 'FAIL'
  errors: string[]
  manifestSha256: string
  exportDate: string | null
  expectedPartitions: number
  downloadedPartitions: number
  expectedRecords: number
  parsedRecords: number | null
  corruptedPartitions: number
  duplicateFilenames: string[]
  mixedExportPartitions: string[]
  recordCountVerified: boolean
  inspections: OpenFdaPartitionInspection[]
}

export function readPinnedOpenFdaCorpus(labelDir: string) {
  const manifestPath = path.join(labelDir, 'download-manifest.json')
  if (!existsSync(manifestPath)) throw new Error('openFDA download manifest bulunamadı')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as LocalOpenFdaManifest
  if (
    manifest.schemaVersion !== 2 ||
    manifest.rawStorage !== 'filesystem-only' ||
    manifest.databaseImported !== false ||
    !manifest.snapshotFile ||
    !manifest.manifestSha256 ||
    !Array.isArray(manifest.files)
  ) {
    throw new Error('openFDA full-corpus manifest güvenlik politikası geçersiz')
  }
  const snapshotPath = path.resolve(labelDir, manifest.snapshotFile)
  const manifestRoot = `${path.resolve(labelDir, 'manifest')}${path.sep}`
  if (!snapshotPath.startsWith(manifestRoot) || !existsSync(snapshotPath)) {
    throw new Error('Pinned openFDA manifest snapshot bulunamadı')
  }
  const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8')) as PinnedOpenFdaManifest
  verifyPinnedOpenFdaManifest(snapshot)
  if (snapshot.manifestSha256 !== manifest.manifestSha256) {
    throw new Error('Pinned snapshot ile download manifest SHA-256 eşleşmiyor')
  }
  return { manifest, snapshot, manifestPath, snapshotPath }
}

export function validateOpenFdaCorpusCoverage(
  manifest: LocalOpenFdaManifest,
  snapshot: PinnedOpenFdaManifest,
  inspections: OpenFdaPartitionInspection[],
  requireParsedRecords: boolean,
): OpenFdaCorpusCoverageReport {
  const errors: string[] = []
  const filenames = manifest.files.map((file) => file.fileName)
  const duplicateFilenames = [
    ...new Set(filenames.filter((name, index) => filenames.indexOf(name) !== index)),
  ]
  const mixedExportPartitions = inspections
    .filter((item) => item.pinnedExportDate !== snapshot.labelExportDate)
    .map((item) => item.fileName)
  const downloadedPartitions = inspections.filter(
    (item) => item.exists && ['verified', 'reused'].includes(item.status),
  ).length
  const corruptedPartitions = inspections.filter(
    (item) => item.exists && (item.parseable === false || !item.bytesMatch || !item.sha256Match),
  ).length
  const declaredRecords = snapshot.partitions.reduce((sum, item) => sum + item.records, 0)
  const parsedRecords = inspections.every((item) => item.parsedRecords !== null)
    ? inspections.reduce((sum, item) => sum + (item.parsedRecords ?? 0), 0)
    : null

  if (manifest.files.length !== snapshot.partitions.length) errors.push('partition_count_mismatch')
  if (duplicateFilenames.length > 0) errors.push('duplicate_filenames')
  if (mixedExportPartitions.length > 0) errors.push('mixed_export_snapshot')
  if (downloadedPartitions !== snapshot.partitions.length) errors.push('missing_partitions')
  if (corruptedPartitions > 0) errors.push('corrupted_partitions')
  if (declaredRecords !== snapshot.totalRecords) errors.push('manifest_record_sum_mismatch')
  if (requireParsedRecords && parsedRecords === null) errors.push('parsed_records_not_verified')
  if (parsedRecords !== null && parsedRecords !== snapshot.totalRecords) {
    errors.push('parsed_record_count_mismatch')
  }
  return {
    status: errors.length === 0 ? 'PASS' : 'FAIL',
    errors,
    manifestSha256: snapshot.manifestSha256,
    exportDate: snapshot.labelExportDate,
    expectedPartitions: snapshot.partitions.length,
    downloadedPartitions,
    expectedRecords: snapshot.totalRecords,
    parsedRecords,
    corruptedPartitions,
    duplicateFilenames,
    mixedExportPartitions,
    recordCountVerified: parsedRecords === snapshot.totalRecords,
    inspections,
  }
}

export async function inspectOpenFdaCorpus(options: {
  labelDir?: string
  parseRecords?: boolean
  verifyHashes?: boolean
}) {
  const labelDir = path.resolve(options.labelDir ?? DEFAULT_OPENFDA_LABEL_DIR)
  const { manifest, snapshot } = readPinnedOpenFdaCorpus(labelDir)
  const inspections: OpenFdaPartitionInspection[] = []
  for (const file of manifest.files) {
    const filePath = path.join(labelDir, file.fileName)
    const exists = existsSync(filePath)
    const inspection: OpenFdaPartitionInspection = {
      fileName: file.fileName,
      exists,
      status: file.status,
      pinnedExportDate: file.pinnedExportDate ?? null,
      bytesMatch:
        exists && typeof file.bytes === 'number' && statSync(filePath).size === file.bytes,
      sha256Match: false,
      parseable: null,
      parsedRecords: null,
      error: null,
    }
    if (exists && file.sha256) {
      inspection.sha256Match =
        options.verifyHashes === false || (await sha256File(filePath)) === file.sha256
    }
    if (exists && options.parseRecords) {
      try {
        let count = 0
        for await (const _row of streamOpenFdaPartition(filePath)) count += 1
        inspection.parseable = true
        inspection.parsedRecords = count
      } catch (error) {
        inspection.parseable = false
        inspection.error = error instanceof Error ? error.message : String(error)
      }
    }
    inspections.push(inspection)
  }
  return validateOpenFdaCorpusCoverage(
    manifest,
    snapshot,
    inspections,
    options.parseRecords === true,
  )
}

export function assertCompleteOpenFdaCorpus(report: OpenFdaCorpusCoverageReport) {
  if (report.status !== 'PASS') {
    throw new Error(`openFDA full corpus verification failed: ${report.errors.join(',')}`)
  }
  return report
}

async function main() {
  const dir = process.argv.find((argument) => argument.startsWith('--dir='))?.slice('--dir='.length)
  const report = await inspectOpenFdaCorpus({
    labelDir: dir,
    parseRecords: !process.argv.includes('--integrity-only'),
    verifyHashes: true,
  })
  assertCompleteOpenFdaCorpus(report)
  console.log(JSON.stringify(report, null, 2))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}

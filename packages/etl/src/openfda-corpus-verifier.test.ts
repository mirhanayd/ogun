import { describe, expect, test } from 'vitest'
import {
  validateOpenFdaCorpusCoverage,
  type OpenFdaPartitionInspection,
} from './openfda-corpus-verifier'
import {
  createPinnedOpenFdaManifest,
  type LocalOpenFdaManifest,
  type OpenFdaPartition,
} from './openfda-label-downloader'

function fixture() {
  const partitions: OpenFdaPartition[] = Array.from({ length: 14 }, (_, index) => ({
    displayName: `part ${index + 1}`,
    url: `https://download.open.fda.gov/drug/label/drug-label-${String(index + 1).padStart(4, '0')}-of-0014.json.zip`,
    fileName: `drug-label-${String(index + 1).padStart(4, '0')}-of-0014.json.zip`,
    sizeMb: 1,
    records: 10,
  }))
  const snapshot = createPinnedOpenFdaManifest({
    sourceLastUpdated: '2026-08-31',
    exportDate: '2026-08-31',
    totalRecords: 140,
    partitions,
  })
  const manifest: LocalOpenFdaManifest = {
    schemaVersion: 2,
    sourceManifestUrl: snapshot.sourceManifestUrl,
    sourceLastUpdated: snapshot.sourceLastUpdated,
    labelExportDate: snapshot.labelExportDate,
    totalRecords: snapshot.totalRecords,
    fetchedAt: snapshot.fetchedAt,
    snapshotFile: 'manifest/snapshot.json',
    manifestSha256: snapshot.manifestSha256,
    rawStorage: 'filesystem-only',
    databaseImported: false,
    files: partitions.map((partition) => ({
      ...partition,
      status: 'verified',
      bytes: 100,
      sha256: 'hash',
      completedAt: '2026-09-01T00:00:00.000Z',
      pinnedExportDate: snapshot.labelExportDate,
    })),
  }
  const inspections: OpenFdaPartitionInspection[] = partitions.map((partition) => ({
    fileName: partition.fileName,
    exists: true,
    status: 'verified',
    pinnedExportDate: snapshot.labelExportDate,
    bytesMatch: true,
    sha256Match: true,
    parseable: true,
    parsedRecords: 10,
    error: null,
  }))
  return { manifest, snapshot, inspections }
}

describe('openFDA full corpus coverage', () => {
  test('14/14 coverage with matching parsed total passes', () => {
    const value = fixture()
    expect(
      validateOpenFdaCorpusCoverage(value.manifest, value.snapshot, value.inspections, true),
    ).toMatchObject({
      status: 'PASS',
      downloadedPartitions: 14,
      parsedRecords: 140,
      recordCountVerified: true,
    })
  })

  test('missing partition fails full mode', () => {
    const value = fixture()
    value.inspections[3] = { ...value.inspections[3]!, exists: false, status: 'pending' }
    expect(
      validateOpenFdaCorpusCoverage(value.manifest, value.snapshot, value.inspections, true).errors,
    ).toContain('missing_partitions')
  })

  test('corrupted partition fails', () => {
    const value = fixture()
    value.inspections[4] = { ...value.inspections[4]!, parseable: false, error: 'bad zip' }
    expect(
      validateOpenFdaCorpusCoverage(value.manifest, value.snapshot, value.inspections, true).errors,
    ).toContain('corrupted_partitions')
  })

  test('mixed export snapshot is rejected', () => {
    const value = fixture()
    value.inspections[0] = { ...value.inspections[0]!, pinnedExportDate: '2026-08-28' }
    expect(
      validateOpenFdaCorpusCoverage(value.manifest, value.snapshot, value.inspections, true).errors,
    ).toContain('mixed_export_snapshot')
  })

  test('manifest total records unequal to parsed records fails', () => {
    const value = fixture()
    value.inspections[0] = { ...value.inspections[0]!, parsedRecords: 9 }
    expect(
      validateOpenFdaCorpusCoverage(value.manifest, value.snapshot, value.inspections, true).errors,
    ).toContain('parsed_record_count_mismatch')
  })

  test('duplicate partition filename is rejected', () => {
    const value = fixture()
    value.manifest.files[1] = {
      ...value.manifest.files[1]!,
      fileName: value.manifest.files[0]!.fileName,
    }
    expect(
      validateOpenFdaCorpusCoverage(value.manifest, value.snapshot, value.inspections, true).errors,
    ).toContain('duplicate_filenames')
  })

  test('full verification requires parsed record counts', () => {
    const value = fixture()
    value.inspections = value.inspections.map((item) => ({
      ...item,
      parseable: null,
      parsedRecords: null,
    }))
    expect(
      validateOpenFdaCorpusCoverage(value.manifest, value.snapshot, value.inspections, true).errors,
    ).toContain('parsed_records_not_verified')
  })
})

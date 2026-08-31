import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, test } from 'vitest'
import {
  createPinnedOpenFdaManifest,
  downloadPartition,
  parseDrugLabelManifest,
  pinOpenFdaManifest,
  verifyPinnedOpenFdaManifest,
  type OpenFdaPartition,
} from './openfda-label-downloader'

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function manifest(
  file = 'https://download.open.fda.gov/drug/label/drug-label-0001-of-0001.json.zip',
) {
  return {
    meta: { last_updated: '2026-08-28' },
    results: {
      drug: {
        label: {
          export_date: '2026-08-28',
          total_records: 12,
          partitions: [{ display_name: 'label', file, size_mb: '1.25', records: 12 }],
        },
      },
    },
  }
}

describe('openFDA label downloader', () => {
  test('official drug.label manifest shape is parsed', () => {
    expect(parseDrugLabelManifest(manifest())).toMatchObject({
      exportDate: '2026-08-28',
      totalRecords: 12,
      partitions: [{ fileName: 'drug-label-0001-of-0001.json.zip', records: 12 }],
    })
  })

  test('non-official download hosts are rejected', () => {
    expect(() =>
      parseDrugLabelManifest(manifest('https://example.com/drug-label-0001-of-0001.json.zip')),
    ).toThrow('İzin verilmeyen')
  })

  test('official manifest section is pinned with a stable content hash', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'ogun-openfda-'))
    temporaryDirectories.push(directory)
    const parsed = parseDrugLabelManifest(manifest())
    const first = pinOpenFdaManifest(
      directory,
      createPinnedOpenFdaManifest(parsed, '2026-09-01T00:00:00.000Z'),
    )
    const second = pinOpenFdaManifest(
      directory,
      createPinnedOpenFdaManifest(parsed, '2026-09-02T00:00:00.000Z'),
    )
    expect(first.reused).toBe(false)
    expect(second.reused).toBe(true)
    expect(second.snapshot.fetchedAt).toBe('2026-09-01T00:00:00.000Z')
    expect(verifyPinnedOpenFdaManifest(second.snapshot)).toMatch(/^[a-f0-9]{64}$/)
  })

  test('tampered pinned manifest hash is rejected', () => {
    const snapshot = createPinnedOpenFdaManifest(parseDrugLabelManifest(manifest()))
    expect(() => verifyPinnedOpenFdaManifest({ ...snapshot, totalRecords: 13 })).toThrow(/SHA-256/)
  })

  test('partial download resumes with an HTTP Range request', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'ogun-openfda-'))
    temporaryDirectories.push(directory)
    const partition: OpenFdaPartition = {
      displayName: 'label',
      url: 'https://download.open.fda.gov/drug/label/drug-label-0001-of-0001.json.zip',
      fileName: 'drug-label-0001-of-0001.json.zip',
      sizeMb: 1,
      records: 1,
    }
    writeFileSync(path.join(directory, `${partition.fileName}.part`), 'abc')
    const requestedRanges: string[] = []
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      requestedRanges.push(new Headers(init?.headers).get('range') ?? '')
      return new Response('def', {
        status: 206,
        headers: { 'content-range': 'bytes 3-5/6', 'content-length': '3' },
      })
    }) as typeof fetch

    const result = await downloadPartition(partition, directory, { fetchImpl, retries: 0 })
    expect(requestedRanges).toEqual(['bytes=3-'])
    expect(readFileSync(result.destination, 'utf8')).toBe('abcdef')
  })

  test('openFDA raw path is gitignored', () => {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
    const result = spawnSync(
      'git',
      ['check-ignore', '--quiet', '--', 'packages/etl/data/clinical/openfda/drug-label/test.zip'],
      { cwd: repoRoot },
    )
    expect(result.status).toBe(0)
  })
})

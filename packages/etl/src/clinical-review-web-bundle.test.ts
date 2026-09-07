import { existsSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  generateClinicalReviewWebBundles,
  type CandidateDetailBundle,
  type CompactSnapshotIndex,
} from './clinical-review-web-bundle'

describe('clinical review web bundles', () => {
  const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const baseDir = path.resolve(packageDir, 'data/clinical/openfda')
  const testOutputDir = path.resolve(packageDir, 'data/clinical/openfda/test-bundles')

  it('generates deterministic compact web review bundles for 323 candidates', () => {
    try {
      const result = generateClinicalReviewWebBundles({
        baseDir,
        outputDir: testOutputDir,
      })

      // Check total candidates
      expect(result.index.totalCandidates).toBe(323)
      expect(result.bundleFilesCount).toBe(323)
      expect(result.semanticHash).toBe('4b971d4a85f3eb2a75066266e9f4154bbe0f91c0802167fc7fded28e76aabbdd')

      // Check priority distribution
      expect(result.index.counts).toEqual({
        P1: 43,
        P2: 93,
        P3: 65,
        P4: 37,
        P5: 85,
      })

      // Verify index.json and index.json.gz exist
      const indexPath = path.join(testOutputDir, 'snapshots', result.semanticHash, 'index.json')
      const indexGzPath = path.join(testOutputDir, 'snapshots', result.semanticHash, 'index.json.gz')
      expect(existsSync(indexPath)).toBe(true)
      expect(existsSync(indexGzPath)).toBe(true)

      const parsedIndex = JSON.parse(readFileSync(indexPath, 'utf8')) as CompactSnapshotIndex
      expect(parsedIndex.candidates.length).toBe(323)

      // Verify a candidate detail file
      const firstCandidate = parsedIndex.candidates[0]!
      const candidatePath = path.join(
        testOutputDir,
        'snapshots',
        result.semanticHash,
        'candidates',
        `${firstCandidate.candidateId}.json.gz`,
      )
      expect(existsSync(candidatePath)).toBe(true)

      const decompressed = gunzipSync(readFileSync(candidatePath)).toString('utf8')
      const detail = JSON.parse(decompressed) as CandidateDetailBundle

      expect(detail.candidate.id).toBe(firstCandidate.candidateId)
      expect(detail.representativeEvidence).toBeDefined()
      expect(detail.evidenceList.length).toBeGreaterThan(0)
      expect(detail.evidenceList.length).toBeLessThanOrEqual(15) // Bounded evidence
      expect(detail.technicalPreReview).toBeDefined()

      // Exclude raw label corpora (bundle size must be compact)
      expect(result.totalBytes).toBeLessThan(1.5 * 1024 * 1024) // < 1.5 MB for all 323 candidates
    } finally {
      rmSync(testOutputDir, { recursive: true, force: true })
    }
  })
})

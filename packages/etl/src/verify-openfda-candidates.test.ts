import { createHash } from 'node:crypto'
import { describe, expect, test } from 'vitest'
import type { OpenFdaCandidateEvidence, OpenFdaInteractionCandidate } from './openfda-types'
import type { OpenFdaExtractionSummary } from './openfda-review-export'
import { validateOpenFdaCandidateArtifacts } from './verify-openfda-candidates'

const candidate: OpenFdaInteractionCandidate = {
  id: 'ofci-1',
  medicationSubstanceId: 'sub-1',
  canonicalName: 'warfarin',
  rxcui: '11289',
  targetType: 'nutrient',
  target: 'vitamin_k',
  action: 'consistency',
  qualifier: null,
  beforeMinutes: null,
  afterMinutes: null,
  extractionReason: 'vitamin_k:consistency:deterministic_phrase',
  candidateConfidence: 'high',
  ingredientAttribution: 'direct_single_ingredient',
  status: 'candidate',
  reviewRequired: true,
  notForProduction: true,
  clinicalRecommendation: null,
  evidenceCount: 1,
  latestEvidenceCount: 1,
  historicalEvidenceCount: 0,
  sourcePartitionCount: 1,
}

const evidence: OpenFdaCandidateEvidence = {
  id: 'ofce-1',
  candidateId: candidate.id,
  sourceSystem: 'openfda',
  splSetId: 'set-1',
  effectiveTime: '20260831',
  labelVersion: '1',
  evidenceVersionStatus: 'latest',
  labelPartitionFile: 'drug-label-0014-of-0014.json.zip',
  productIdentifiers: { applicationNumbers: [], productNdcs: [], packageNdcs: [], brandNames: [] },
  matchedSection: 'drug_interactions',
  evidenceSnippet: 'Maintain a consistent intake of vitamin K.',
  recordHash: 'hash',
  retrievedAt: '2026-08-31T00:00:00Z',
  extractionVersion: 'openfda-food-candidate-v1',
  labelMatchTier: 'exact_substance_name_match',
  matchedField: 'openfda.substance_name',
  matchedValue: 'WARFARIN',
  confidence: 'high',
  ambiguous: false,
  ingredientAttribution: 'direct_single_ingredient',
  activeIngredientCount: 1,
  evidenceNamesSubject: true,
}

const summary = {
  logicalCandidates: 1,
  evidenceRecords: 1,
  availablePartitions: 14,
  manifestPartitions: 14,
  missingPartitions: [],
  partialCoverage: false,
  attributionCounts: {
    direct_single_ingredient: 1,
    direct_substance_section: 0,
    multi_ingredient_attributable: 0,
    multi_ingredient_unattributed: 0,
    secondary_match_uncertain: 0,
  },
  openfda: {
    partitionCount: 14,
    expectedTotalRecords: 1,
    parsedTotalRecords: 1,
    manifestSha256: 'manifest-hash',
  },
  rxnorm: { verifiedSeedCount: 1, verifiedSeedSha256: 'seed-hash' },
  extraction: {
    semanticHash: createHash('sha256')
      .update(JSON.stringify([candidate]))
      .update('\0')
      .update(JSON.stringify([evidence]))
      .digest('hex'),
  },
} as unknown as OpenFdaExtractionSummary

describe('openFDA candidate artifact verifier', () => {
  test('valid review-only artifact set passes with a stable semantic hash', () => {
    const first = validateOpenFdaCandidateArtifacts(
      [candidate],
      [evidence],
      summary,
      new Set(['sub-1']),
    )
    const second = validateOpenFdaCandidateArtifacts(
      [candidate],
      [evidence],
      summary,
      new Set(['sub-1']),
    )
    expect(first).toMatchObject({ status: 'PASS', candidates: 1, evidence: 1 })
    expect(second.semanticHash).toBe(first.semanticHash)
  })

  test('unverified subject and production leakage fail', () => {
    const result = validateOpenFdaCandidateArtifacts(
      [{ ...candidate, notForProduction: false as true }],
      [evidence],
      summary,
      new Set(),
    )
    expect(result.status).toBe('FAIL')
    expect(result.errors).toEqual(
      expect.arrayContaining(['unverified_subject:sub-1', 'production_isolation:ofci-1']),
    )
  })

  test('duplicate logical candidate and orphan evidence fail', () => {
    const result = validateOpenFdaCandidateArtifacts(
      [candidate, { ...candidate, id: 'ofci-2' }],
      [{ ...evidence, candidateId: 'missing' }],
      { ...summary, logicalCandidates: 2 },
      new Set(['sub-1']),
    )
    expect(result.status).toBe('FAIL')
    expect(result.errors.some((error) => error.startsWith('duplicate_logical_candidate'))).toBe(
      true,
    )
    expect(result.errors).toContain('orphan_evidence:ofce-1')
  })

  test('missing coverage and overlong evidence fail', () => {
    const result = validateOpenFdaCandidateArtifacts(
      [candidate],
      [{ ...evidence, evidenceSnippet: 'x'.repeat(481) }],
      { ...summary, availablePartitions: 0 },
      new Set(['sub-1']),
    )
    expect(result.errors).toEqual(
      expect.arrayContaining(['no_available_partitions', 'long_evidence:ofce-1']),
    )
  })
})

import { describe, expect, test } from 'vitest'
import { planRxNormVerificationMutations } from './verify-rxnorm-mappings'
import type { HumanReviewDecision, VerificationClassification } from './rxnorm-verification-types'

const verified: VerificationClassification = {
  medicationSubstanceId: 'sub-a',
  canonicalName: 'Metformin',
  sourcePhrase: 'metformin',
  rxcui: '6809',
  rxnormTerm: 'metformin',
  tty: 'IN',
  matchMethod: 'lexical_exact',
  tier: 'VERIFIED_EXACT',
  reason: 'unique_lexical_exact',
  verificationMethod: 'deterministic_exact_v1',
  verificationVersion: 'strict-rxnorm-verification-v1',
}
const timestamp = new Date('2026-08-31T12:00:00Z')
const existing = {
  id: 'mapping-a',
  medicationSubstanceId: 'sub-a',
  rxcui: '6809',
  mappingStatus: 'candidate',
  matchMethod: 'lexical_exact',
  reviewedBy: null,
  reviewedAt: null,
  verificationMethod: null,
  verificationReason: null,
  verificationVersion: null,
}

describe('RxNorm verification mutation planning', () => {
  test('dry-run planning is pure and does not mutate DB-shaped input', () => {
    const before = structuredClone(existing)
    const plan = planRxNormVerificationMutations([verified], [], [existing], timestamp)
    expect(plan.mutations).toHaveLength(1)
    expect(existing).toEqual(before)
  })

  test('second apply produces zero semantic updates and preserves timestamp', () => {
    const first = planRxNormVerificationMutations([verified], [], [existing], timestamp)
    const mutation = first.mutations[0]!
    const afterFirst = {
      ...existing,
      mappingStatus: mutation.mappingStatus,
      reviewedBy: mutation.reviewedBy,
      reviewedAt: mutation.reviewedAt,
      verificationMethod: mutation.verificationMethod,
      verificationReason: mutation.verificationReason,
      verificationVersion: mutation.verificationVersion,
    }
    const second = planRxNormVerificationMutations(
      [verified],
      [],
      [afterFirst],
      new Date('2026-09-01T12:00:00Z'),
    )
    expect(second.mutations).toHaveLength(0)
    expect(second.unchanged).toBe(1)
    expect(afterFirst.reviewedAt).toEqual(timestamp)
  })

  test('human review provenance overrides deterministic provenance', () => {
    const decisions: HumanReviewDecision[] = [
      {
        medicationSubstanceId: 'sub-a',
        rxcui: '6809',
        decision: 'verify',
        reviewer: 'reviewer@example.test',
        reviewedAt: timestamp,
        note: 'checked',
      },
    ]
    const plan = planRxNormVerificationMutations([verified], decisions, [existing], timestamp)
    expect(plan.mutations[0]).toMatchObject({
      mappingStatus: 'verified',
      verificationMethod: 'human_review',
      reviewedBy: 'reviewer@example.test',
    })
  })

  test('mutation outside imported candidate set fails closed', () => {
    expect(() => planRxNormVerificationMutations([verified], [], [], timestamp)).toThrow(
      /candidate set dışında/i,
    )
  })
})

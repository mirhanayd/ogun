import { describe, expect, it } from 'vitest'
import {
  validateClinicalReviewDecisions,
  type ClinicalReviewDecisionRow,
} from './clinical-review-decisions'
import {
  stableClinicalEvidenceId,
  stableClinicalInteractionId,
} from './importers/clinical-interactions'
import type {
  OpenFdaCandidateEvidence,
  OpenFdaInteractionCandidate,
} from './openfda-types'

const HASH = '4b971d4a85f3eb2a75066266e9f4154bbe0f91c0802167fc7fded28e76aabbdd'
const SUBSTANCE = 'med_test'

function candidate(
  overrides: Partial<OpenFdaInteractionCandidate> = {},
): OpenFdaInteractionCandidate {
  return {
    id: 'candidate_1',
    medicationSubstanceId: SUBSTANCE,
    canonicalName: 'Test substance',
    rxcui: '123',
    targetType: 'nutrient',
    target: 'calcium',
    action: 'separate_timing',
    qualifier: null,
    beforeMinutes: 120,
    afterMinutes: 120,
    extractionReason: 'test',
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
    ...overrides,
  }
}

function evidence(overrides: Partial<OpenFdaCandidateEvidence> = {}): OpenFdaCandidateEvidence {
  return {
    id: 'evidence_1',
    candidateId: 'candidate_1',
    sourceSystem: 'openfda',
    splSetId: 'spl-set-1',
    effectiveTime: '20260801',
    labelVersion: '3',
    evidenceVersionStatus: 'latest',
    labelPartitionFile: 'drug-label-0001-of-0014.json.zip',
    productIdentifiers: {
      applicationNumbers: [],
      productNdcs: [],
      packageNdcs: [],
      brandNames: [],
    },
    matchedSection: 'drug_interactions',
    evidenceSnippet: 'Source excerpt that is never copied to production evidence_summary.',
    recordHash: 'record-hash',
    retrievedAt: '2026-09-02T00:00:00.000Z',
    extractionVersion: 'openfda-food-candidate-v1',
    labelMatchTier: 'exact_rxcui_match',
    matchedField: 'openfda.rxcui',
    matchedValue: '123',
    confidence: 'high',
    ambiguous: false,
    ingredientAttribution: 'direct_single_ingredient',
    activeIngredientCount: 1,
    evidenceNamesSubject: true,
    ...overrides,
  }
}

function row(overrides: Partial<ClinicalReviewDecisionRow> = {}): ClinicalReviewDecisionRow {
  return {
    candidate_id: 'candidate_1',
    candidate_semantic_hash: HASH,
    decision: 'approve',
    reviewer: 'Dr Human Reviewer',
    reviewed_at: '2026-09-02T09:00:00.000Z',
    severity: 'moderate',
    evidence_strength: 'limited',
    approved_target_key: 'nutrient:CA',
    approved_action: 'separate_timing',
    accept_attribution_risk: '',
    title_tr: '',
    clinical_effect_tr: '',
    mechanism_tr: '',
    recommendation_tr: '',
    review_note: '',
    ...overrides,
  }
}

function validate(
  reviewRow: ClinicalReviewDecisionRow,
  options: {
    candidates?: OpenFdaInteractionCandidate[]
    evidence?: OpenFdaCandidateEvidence[]
    verified?: ReadonlySet<string>
  } = {},
) {
  return validateClinicalReviewDecisions({
    rows: [reviewRow],
    candidates: options.candidates ?? [candidate()],
    evidence: options.evidence ?? [evidence()],
    candidateSemanticHash: HASH,
    verifiedMedicationSubstanceIds: options.verified ?? new Set([SUBSTANCE]),
  })
}

describe('clinical approval fail-closed validation', () => {
  it.each([
    ['missing reviewer', { reviewer: '' }, /requires reviewer/],
    ['AI reviewer', { reviewer: 'AI' }, /explicit human/],
    ['system reviewer', { reviewer: 'system' }, /explicit human/],
    ['missing reviewed_at', { reviewed_at: '' }, /requires reviewed_at/],
    ['stale semantic hash', { candidate_semantic_hash: 'stale' }, /Stale candidate/],
    ['unresolved target', { approved_target_key: 'food:unknown' }, /Unresolved approved target/],
    ['invalid action', { approved_action: 'invented' }, /Invalid approved action/],
    ['invalid severity', { severity: 'severe' }, /Invalid severity/],
    ['invalid evidence strength', { evidence_strength: 'high' }, /Invalid evidence strength/],
  ])('%s fails', (_name, changes, message) => {
    expect(() => validate(row(changes), {})).toThrow(message)
  })

  it('rejects a nonexistent candidate', () => {
    expect(() => validate(row(), { candidates: [] })).toThrow(/does not exist/)
  })

  it('rejects an unverified medication subject', () => {
    expect(() => validate(row(), { verified: new Set() })).toThrow(/Unverified medication/)
  })

  it('rejects an approval with no evidence', () => {
    expect(() => validate(row(), { evidence: [] })).toThrow(/evidence missing/)
  })

  it('requires explicit attribution-risk acceptance and a note', () => {
    const unsafe = candidate({ ingredientAttribution: 'multi_ingredient_unattributed' })
    expect(() => validate(row(), { candidates: [unsafe] })).toThrow(/Attribution risk/)
    expect(() =>
      validate(row({ accept_attribution_risk: 'true' }), { candidates: [unsafe] }),
    ).toThrow(/Attribution risk/)
    expect(
      validate(
        row({ accept_attribution_risk: 'true', review_note: 'Human reviewed attribution.' }),
        { candidates: [unsafe] },
      )[0]?.decision,
    ).toBe('approve')
  })

  it.each(['reject', 'defer', 'needs_more_evidence'])('%s remains non-approved', (decision) => {
    const [validated] = validate(
      row({
        decision,
        reviewer: '',
        reviewed_at: '',
        severity: '',
        evidence_strength: '',
        approved_target_key: '',
        approved_action: '',
      }),
    )
    expect(validated?.decision).toBe(decision)
    expect(validated?.severity).toBeNull()
    expect(validated?.approvedAction).toBeNull()
  })

  it('keeps extraction confidence separate from reviewer severity and evidence strength', () => {
    const [validated] = validate(row({ severity: 'info', evidence_strength: 'unknown' }))
    expect(validated?.candidate.candidateConfidence).toBe('high')
    expect(validated?.severity).toBe('info')
    expect(validated?.evidenceStrength).toBe('unknown')
  })
})

describe('stable production identifiers', () => {
  it('is deterministic and candidate-scoped', () => {
    expect(stableClinicalInteractionId('candidate_1')).toBe(
      stableClinicalInteractionId('candidate_1'),
    )
    expect(stableClinicalInteractionId('candidate_1')).not.toBe(
      stableClinicalInteractionId('candidate_2'),
    )
  })

  it('keys evidence by interaction, source document and source hash', () => {
    const item = evidence()
    const first = stableClinicalEvidenceId('interaction_1', item)
    expect(first).toBe(stableClinicalEvidenceId('interaction_1', item))
    expect(first).not.toBe(
      stableClinicalEvidenceId('interaction_1', { ...item, recordHash: 'changed' }),
    )
  })
})

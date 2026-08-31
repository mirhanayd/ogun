import { describe, expect, test } from 'vitest'
import type { CandidateMapping, PreparedMapping, SubstanceIdentity, WorklistRow } from './rxnorm-mapping'
import {
  applyHumanVerificationDecisions,
  parseRxNormReviewDecisions,
  reviewDecisionKey,
} from './rxnorm-review-decisions'
import { classifyRxNormMappings, isSafeNormalizedExact } from './rxnorm-verification'
import { serializeVerifiedRxNormSubstances } from './rxnorm-verified-export'

function substance(
  id = 'sub-a',
  overrides: Partial<SubstanceIdentity> = {},
): SubstanceIdentity {
  return {
    id,
    nameTr: id,
    normalizedName: id,
    searchText: id,
    isCombination: false,
    ...overrides,
  }
}

function prepared(
  medicationSubstanceId = 'sub-a',
  overrides: Partial<WorklistRow> & {
    method?: CandidateMapping['matchMethod']
    resolution?: PreparedMapping['resolution']
  } = {},
): PreparedMapping {
  const method = overrides.method ?? 'lexical_exact'
  const row: WorklistRow = {
    source_phrase: overrides.source_phrase ?? 'metformin',
    source_occurrences: '1',
    normalized_source: overrides.normalized_source ?? 'metformin',
    is_combination_hint: overrides.is_combination_hint ?? 'False',
    is_complex_or_biologic_hint: 'False',
    best_rxcui: overrides.best_rxcui ?? '6809',
    best_rxnorm_name: overrides.best_rxnorm_name ?? 'metformin',
    best_rxnorm_tty: overrides.best_rxnorm_tty ?? 'IN',
    match_method: method,
    lexical_score: '100',
    score_margin: '10',
    atc_name: '',
    atc_support_count: '',
    atc_total_count: '',
    atc_dominance: '',
    atc_mapped_rxcui: overrides.atc_mapped_rxcui ?? '',
    atc_mapping_kind: '',
    review_tier: overrides.review_tier ?? 'high_confidence_review',
    publish_status: 'candidate_only',
  }
  const resolution = overrides.resolution ?? {
    kind: 'resolved' as const,
    medicationSubstanceId,
    joinMethod: 'canonical_name' as const,
  }
  return {
    row,
    resolution,
    candidate:
      resolution.kind === 'resolved' && row.best_rxcui
        ? {
            id: `mapping-${medicationSubstanceId}-${row.best_rxcui}`,
            medicationSubstanceId,
            system: 'RXNORM',
            externalId: row.best_rxcui,
            mappingStatus: 'candidate',
            matchMethod: method,
            confidence: 1,
            matchedTerm: row.best_rxnorm_name,
            externalTermType: row.best_rxnorm_tty,
            sourceVersion: '2026-08-03',
            sourcePhrase: row.source_phrase,
            reviewTier: row.review_tier,
            joinMethod: 'canonical_name',
            isCombinationHint: row.is_combination_hint === 'True',
          }
        : null,
  }
}

function classify(items: PreparedMapping[], substances = [substance()]) {
  return classifyRxNormMappings(items, substances).classifications
}

describe('strict deterministic RxNorm verification', () => {
  test('unique lexical exact IN is eligible', () => {
    expect(classify([prepared()])[0]).toMatchObject({
      tier: 'VERIFIED_EXACT',
      reason: 'unique_lexical_exact',
      verificationMethod: 'deterministic_exact_v1',
    })
  })

  test('unique lexical exact PIN is eligible', () => {
    expect(classify([prepared('sub-a', { best_rxnorm_tty: 'PIN' })])[0]?.tier).toBe(
      'VERIFIED_EXACT',
    )
  })

  test('intact combination can map to one MIN', () => {
    const combo = substance('sub-a', { isCombination: true })
    expect(classify([prepared('sub-a', { best_rxnorm_tty: 'MIN' })], [combo])[0]?.tier).toBe(
      'VERIFIED_EXACT',
    )
  })

  test('two distinct RxCUIs are never verified', () => {
    const result = classify([prepared(), prepared('sub-a', { best_rxcui: '999' })])[0]
    expect(result).toMatchObject({ tier: 'AMBIGUOUS', reason: 'multiple_rxcui_review' })
  })

  test.each([
    ['fuzzy', 'fuzzy_requires_review'],
    ['atc_bridge', 'atc_requires_review'],
    ['token_exact', 'token_requires_review'],
  ] as const)('%s evidence is deferred', (method, reason) => {
    expect(classify([prepared('sub-a', { method })])[0]).toMatchObject({
      tier: method === 'atc_bridge' ? 'REVIEW_ATC' : 'REVIEW_MANUAL',
      reason,
      verificationMethod: null,
    })
  })

  test('unsafe normalized transliteration is not eligible', () => {
    const result = classify([
      prepared('sub-a', {
        method: 'normalized_exact',
        source_phrase: 'metformin hidroklorür',
        best_rxnorm_name: 'metformin hydrochloride',
      }),
    ])[0]
    expect(result).toMatchObject({ tier: 'REVIEW_HIGH', reason: 'unsafe_normalization' })
  })

  test('safe punctuation/case normalization is eligible', () => {
    expect(isSafeNormalizedExact('  METFORMIN—HCL ', 'metformin hcl')).toBe(true)
    const result = classify([
      prepared('sub-a', {
        method: 'normalized_exact',
        source_phrase: '  METFORMIN—HCL ',
        best_rxnorm_name: 'metformin hcl',
      }),
    ])[0]
    expect(result).toMatchObject({
      tier: 'VERIFIED_EXACT',
      reason: 'unique_safe_normalized_exact',
    })
  })

  test('combination cannot collapse to IN', () => {
    const combo = substance('sub-a', { isCombination: true })
    expect(classify([prepared()], [combo])[0]).toMatchObject({
      tier: 'REVIEW_MANUAL',
      reason: 'combination_requires_min',
    })
  })

  test('non-combination cannot map to MIN', () => {
    expect(classify([prepared('sub-a', { best_rxnorm_tty: 'MIN' })])[0]).toMatchObject({
      tier: 'REVIEW_MANUAL',
      reason: 'single_ingredient_rejects_min',
    })
  })

  test('shared RxCUI blocks every involved substance', () => {
    const substances = [substance('sub-a'), substance('sub-b')]
    const result = classify([prepared('sub-a'), prepared('sub-b')], substances)
    expect(result).toHaveLength(2)
    expect(result.every((item) => item.reason === 'shared_rxcui_review')).toBe(true)
    expect(result.every((item) => item.tier === 'AMBIGUOUS')).toBe(true)
  })

  test('conflicting ATC RxCUI cannot resolve lexical evidence', () => {
    expect(classify([prepared('sub-a', { atc_mapped_rxcui: '999' })])[0]).toMatchObject({
      tier: 'AMBIGUOUS',
      reason: 'conflicting_evidence',
    })
  })

  test('orphan canonical join fails closed', () => {
    expect(() => classifyRxNormMappings([prepared('missing')], [substance()])).toThrow(/orphan/i)
  })

  test('unresolved phrase cannot be attributed to a canonical substance', () => {
    const report = classifyRxNormMappings(
      [prepared('sub-a', { resolution: { kind: 'unmapped' } })],
      [substance()],
    )
    expect(report.unresolvedPhrases[0]).toMatchObject({
      medicationSubstanceId: null,
      tier: 'UNMAPPED',
      reason: 'canonical_join_unmapped',
    })
  })
})

describe('RxNorm human review safety', () => {
  const context = {
    knownSubstanceIds: new Set(['sub-a']),
    knownRxCuis: new Set(['6809', '999']),
    candidateKeys: new Set([reviewDecisionKey('sub-a', '6809')]),
  }
  const header = 'medication_substance_id,rxnorm_rxcui,decision,reviewer,reviewed_at,note\n'

  test('invalid human decision fails', () => {
    expect(() =>
      parseRxNormReviewDecisions(
        `${header}sub-a,6809,approve,reviewer,2026-08-31T12:00:00Z,note\n`,
        context,
      ),
    ).toThrow(/geçersiz decision/i)
  })

  test('human verify outside candidate set fails', () => {
    expect(() =>
      parseRxNormReviewDecisions(
        `${header}sub-a,999,verify,reviewer,2026-08-31T12:00:00Z,note\n`,
        context,
      ),
    ).toThrow(/candidate set dışında/i)
  })

  test('unknown substance and unknown RxCUI fail', () => {
    expect(() =>
      parseRxNormReviewDecisions(
        `${header}missing,6809,defer,reviewer,2026-08-31T12:00:00Z,note\n`,
        context,
      ),
    ).toThrow(/bilinmeyen medication/i)
    expect(() =>
      parseRxNormReviewDecisions(
        `${header}sub-a,12345,defer,reviewer,2026-08-31T12:00:00Z,note\n`,
        context,
      ),
    ).toThrow(/bilinmeyen RxCUI/i)
  })

  test('conflicting decisions for one mapping fail', () => {
    expect(() =>
      parseRxNormReviewDecisions(
        `${header}sub-a,6809,verify,reviewer,2026-08-31T12:00:00Z,a\nsub-a,6809,reject,reviewer,2026-08-31T12:00:00Z,b\n`,
        context,
      ),
    ).toThrow(/conflicting decision/i)
  })

  test('human verify has distinct provenance', () => {
    const decisions = parseRxNormReviewDecisions(
      `${header}sub-a,6809,verify,reviewer,2026-08-31T12:00:00Z,checked\n`,
      context,
    )
    const result = applyHumanVerificationDecisions(classify([prepared()]), decisions)
    expect(result[0]).toMatchObject({
      verificationMethod: 'human_review',
      reason: 'human_review_approved',
    })
  })
})

describe('verified-only extraction safety', () => {
  const verified = {
    medicationSubstanceId: 'sub-a',
    canonicalName: 'Metformin',
    rxcui: '6809',
    tty: 'IN',
    sourceVersion: '2026-08-03',
    mappingStatus: 'verified',
  }

  test('compact export has exactly the five permitted fields', () => {
    const row = JSON.parse(serializeVerifiedRxNormSubstances([verified]))
    expect(row).toEqual({
      medication_substance_id: 'sub-a',
      canonical_name: 'Metformin',
      rxcui: '6809',
      tty: 'IN',
      source_version: '2026-08-03',
    })
  })

  test('candidate row cannot leak into verified export', () => {
    expect(() =>
      serializeVerifiedRxNormSubstances([{ ...verified, mappingStatus: 'candidate' }]),
    ).toThrow(/candidate sızıntısı/i)
  })
})

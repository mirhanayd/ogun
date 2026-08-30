import { describe, expect, test } from 'vitest'
import {
  buildSubstanceResolver,
  deterministicMappingId,
  prepareMappings,
  selectDeterministicCandidates,
  verifyRxNormPackage,
  type SubstanceAliasIdentity,
  type SubstanceIdentity,
  type WorklistRow,
} from './rxnorm-mapping'

const substances: SubstanceIdentity[] = [
  {
    id: 'sub-a',
    nameTr: 'Metformin hidroklorür',
    normalizedName: 'metformin hidroklorur',
    searchText: 'metformin hidroklorur',
    isCombination: false,
  },
  {
    id: 'sub-b',
    nameTr: 'Deksametazon',
    normalizedName: 'deksametazon',
    searchText: 'deksametazon',
    isCombination: false,
  },
]

function worklist(overrides: Partial<WorklistRow> = {}): WorklistRow {
  return {
    source_phrase: 'Metformin hidroklorür',
    source_occurrences: '1',
    normalized_source: 'metformin',
    is_combination_hint: 'False',
    is_complex_or_biologic_hint: 'False',
    best_rxcui: '6809',
    best_rxnorm_name: 'metformin',
    best_rxnorm_tty: 'IN',
    match_method: 'lexical_exact',
    lexical_score: '100',
    score_margin: '10',
    atc_name: '',
    atc_support_count: '',
    atc_total_count: '',
    atc_dominance: '',
    atc_mapped_rxcui: '',
    atc_mapping_kind: '',
    review_tier: 'high_confidence_review',
    publish_status: 'candidate_only',
    ...overrides,
  }
}

describe('RxNorm canonical mapping safety', () => {
  test('canonical substance join resolves one existing identity', () => {
    expect(buildSubstanceResolver(substances, [])('Metformin hidroklorür')).toMatchObject({
      kind: 'resolved',
      medicationSubstanceId: 'sub-a',
      joinMethod: 'canonical_name',
    })
  })

  test('alias join resolves the canonical substance', () => {
    const aliases: SubstanceAliasIdentity[] = [
      { medicationSubstanceId: 'sub-b', alias: 'Dekzametazon', searchNormalized: 'dekzametazon' },
    ]
    expect(buildSubstanceResolver(substances, aliases)('dekzametazon')).toMatchObject({
      kind: 'resolved',
      medicationSubstanceId: 'sub-b',
      joinMethod: 'alias',
    })
  })

  test('ambiguous alias is never silently first-matched', () => {
    const aliases: SubstanceAliasIdentity[] = [
      { medicationSubstanceId: 'sub-a', alias: 'ortak', searchNormalized: 'ortak' },
      { medicationSubstanceId: 'sub-b', alias: 'ortak', searchNormalized: 'ortak' },
    ]
    expect(buildSubstanceResolver(substances, aliases)('ortak')).toEqual({
      kind: 'ambiguous',
      medicationSubstanceIds: ['sub-a', 'sub-b'],
    })
  })

  test('unknown phrase remains unmapped', () => {
    expect(buildSubstanceResolver(substances, [])('bilinmeyen etkin madde')).toEqual({
      kind: 'unmapped',
    })
  })

  test('fuzzy candidate remains candidate-only', () => {
    const [prepared] = prepareMappings(
      [worklist({ match_method: 'fuzzy', lexical_score: '72', review_tier: 'manual_review' })],
      buildSubstanceResolver(substances, []),
    )
    expect(prepared?.candidate).toMatchObject({ mappingStatus: 'candidate', matchMethod: 'fuzzy' })
  })

  test('normalized exact is not automatically verified', () => {
    const [prepared] = prepareMappings(
      [worklist({ match_method: 'normalized_exact' })],
      buildSubstanceResolver(substances, []),
    )
    expect(prepared?.candidate).toMatchObject({
      mappingStatus: 'candidate',
      matchMethod: 'normalized_exact',
    })
  })

  test('package-unmapped row does not create DB candidate metadata', () => {
    const [prepared] = prepareMappings(
      [worklist({ review_tier: 'unmapped' })],
      buildSubstanceResolver(substances, []),
    )
    expect(prepared?.candidate).toBeNull()
  })

  test('duplicate import inputs collapse to one deterministic mapping', () => {
    const prepared = prepareMappings(
      [worklist(), worklist()],
      buildSubstanceResolver(substances, []),
    )
    expect(selectDeterministicCandidates(prepared)).toHaveLength(1)
  })

  test('repeated preparation keeps row count and IDs stable', () => {
    const resolver = buildSubstanceResolver(substances, [])
    const first = selectDeterministicCandidates(prepareMappings([worklist()], resolver))
    const second = selectDeterministicCandidates(prepareMappings([worklist()], resolver))
    expect(second).toEqual(first)
    expect(first[0]?.id).toBe(deterministicMappingId('sub-a', '6809'))
  })

  test('preplaced package passes all manifest hashes', () => {
    expect(verifyRxNormPackage().outputs).toHaveLength(7)
  })
})

import type { MappingMethod } from './rxnorm-mapping'

export const RXNORM_VERIFICATION_VERSION = 'strict-rxnorm-verification-v1' as const
export const DETERMINISTIC_VERIFICATION_METHOD = 'deterministic_exact_v1' as const
export const HUMAN_VERIFICATION_METHOD = 'human_review' as const
export const RXNORM_ALLOWED_TERM_TYPES = ['IN', 'PIN', 'MIN'] as const

export type RxNormTermType = (typeof RXNORM_ALLOWED_TERM_TYPES)[number]
export type VerificationMethod =
  | typeof DETERMINISTIC_VERIFICATION_METHOD
  | typeof HUMAN_VERIFICATION_METHOD
  | 'manual_override'

export type VerificationTier =
  | 'VERIFIED_EXACT'
  | 'REVIEW_HIGH'
  | 'REVIEW_ATC'
  | 'REVIEW_MANUAL'
  | 'AMBIGUOUS'
  | 'UNMAPPED'

export type VerificationReason =
  | 'unique_lexical_exact'
  | 'unique_safe_normalized_exact'
  | 'canonical_join_ambiguous'
  | 'canonical_join_unmapped'
  | 'no_candidate'
  | 'multiple_rxcui_review'
  | 'shared_rxcui_review'
  | 'conflicting_evidence'
  | 'atc_requires_review'
  | 'token_requires_review'
  | 'fuzzy_requires_review'
  | 'manual_requires_review'
  | 'unsafe_normalization'
  | 'combination_requires_min'
  | 'single_ingredient_rejects_min'
  | 'invalid_rxnorm_tty'

export type StrictVerificationCandidate = {
  medicationSubstanceId: string
  canonicalName: string
  isCombination: boolean
  sourcePhrase: string
  rxcui: string
  rxnormTerm: string
  tty: string
  matchMethod: MappingMethod | 'manual'
  reviewTier: string
  joinKind: 'resolved' | 'ambiguous' | 'unmapped'
}

export type VerificationClassification = {
  medicationSubstanceId: string | null
  canonicalName: string
  sourcePhrase: string
  rxcui: string
  rxnormTerm: string
  tty: string
  matchMethod: MappingMethod | 'manual' | ''
  tier: VerificationTier
  reason: VerificationReason
  verificationMethod: typeof DETERMINISTIC_VERIFICATION_METHOD | null
  verificationVersion: typeof RXNORM_VERIFICATION_VERSION
}

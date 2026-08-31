export const OPENFDA_EXTRACTION_VERSION = 'openfda-food-candidate-v1' as const

export type VerifiedRxNormSeed = {
  medicationSubstanceId: string
  canonicalName: string
  rxcui: string
  tty: 'IN' | 'PIN' | 'MIN'
  sourceVersion: string
}

export type OpenFdaLabelRecord = {
  id?: unknown
  set_id?: unknown
  effective_time?: unknown
  version?: unknown
  openfda?: {
    rxcui?: unknown
    substance_name?: unknown
    generic_name?: unknown
    spl_id?: unknown
    spl_set_id?: unknown
    application_number?: unknown
    product_ndc?: unknown
    package_ndc?: unknown
    brand_name?: unknown
    manufacturer_name?: unknown
    [key: string]: unknown
  }
  [key: string]: unknown
}

export type OpenFdaMatchTier =
  | 'exact_rxcui_match'
  | 'exact_substance_name_match'
  | 'normalized_substance_name_match'
  | 'secondary_generic_match'

export type OpenFdaSubstanceMatch = {
  seed: VerifiedRxNormSeed
  tier: OpenFdaMatchTier
  matchedField: 'openfda.rxcui' | 'openfda.substance_name' | 'openfda.generic_name'
  matchedValue: string
  ambiguous: boolean
}

export type OpenFdaTargetType =
  'nutrient' | 'food_component' | 'food' | 'food_group' | 'supplement' | 'alcohol' | 'meal_timing'

export type OpenFdaCandidateAction =
  | 'avoid'
  | 'limit'
  | 'caution'
  | 'monitor'
  | 'consistency'
  | 'separate_timing'
  | 'take_with_food'
  | 'take_without_food'
  | 'avoid_alcohol'
  | 'individualize'

export type OpenFdaCandidateTrigger = {
  targetType: OpenFdaTargetType
  target: string
  action: OpenFdaCandidateAction
  qualifier: string | null
  beforeMinutes: number | null
  afterMinutes: number | null
  extractionReason: string
  evidenceSnippet: string
  signal: 'explicit_directive' | 'explicit_effect' | 'ambiguous_context'
}

export type OpenFdaCandidateConfidence = 'high' | 'medium' | 'low'

export type OpenFdaIngredientAttribution =
  import('./openfda-ingredient-attribution').OpenFdaIngredientAttribution

export type OpenFdaInteractionCandidate = {
  id: string
  medicationSubstanceId: string
  canonicalName: string
  rxcui: string
  targetType: OpenFdaTargetType
  target: string
  action: OpenFdaCandidateAction
  qualifier: string | null
  beforeMinutes: number | null
  afterMinutes: number | null
  extractionReason: string
  candidateConfidence: OpenFdaCandidateConfidence
  ingredientAttribution: OpenFdaIngredientAttribution
  status: 'candidate'
  reviewRequired: true
  notForProduction: true
  clinicalRecommendation: null
  evidenceCount: number
}

export type OpenFdaCandidateEvidence = {
  id: string
  candidateId: string
  sourceSystem: 'openfda'
  splSetId: string
  effectiveTime: string | null
  labelPartitionFile: string
  productIdentifiers: {
    applicationNumbers: string[]
    productNdcs: string[]
    packageNdcs: string[]
    brandNames: string[]
  }
  matchedSection: string
  evidenceSnippet: string
  recordHash: string
  retrievedAt: string
  extractionVersion: typeof OPENFDA_EXTRACTION_VERSION
  labelMatchTier: OpenFdaMatchTier
  matchedField: OpenFdaSubstanceMatch['matchedField']
  matchedValue: string
  confidence: OpenFdaCandidateConfidence
  ambiguous: boolean
  ingredientAttribution: OpenFdaIngredientAttribution
  activeIngredientCount: number
  evidenceNamesSubject: boolean
}

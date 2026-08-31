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

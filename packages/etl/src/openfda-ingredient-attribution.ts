import type { OpenFdaLabelRecord, OpenFdaSubstanceMatch } from './openfda-types'
import { normalizeOpenFdaName } from './openfda-verified-filter'

export const OPENFDA_INGREDIENT_ATTRIBUTIONS = [
  'direct_single_ingredient',
  'direct_substance_section',
  'multi_ingredient_attributable',
  'multi_ingredient_unattributed',
  'secondary_match_uncertain',
] as const

export type OpenFdaIngredientAttribution = (typeof OPENFDA_INGREDIENT_ATTRIBUTIONS)[number]

const ATTRIBUTION_RANK: Record<OpenFdaIngredientAttribution, number> = {
  secondary_match_uncertain: 1,
  multi_ingredient_unattributed: 2,
  multi_ingredient_attributable: 3,
  direct_substance_section: 4,
  direct_single_ingredient: 5,
}

function stringValues(value: unknown) {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : []
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function containsNormalizedPhrase(text: string, phrase: string) {
  const normalizedText = ` ${normalizeOpenFdaName(text)} `
  const normalizedPhrase = normalizeOpenFdaName(phrase)
  return normalizedPhrase.length > 1 && normalizedText.includes(` ${normalizedPhrase} `)
}

export function classifyOpenFdaIngredientAttribution(
  record: OpenFdaLabelRecord,
  match: OpenFdaSubstanceMatch,
  evidenceSnippet: string,
) {
  const activeIngredients = [
    ...new Set(
      stringValues(record.openfda?.substance_name).map(normalizeOpenFdaName).filter(Boolean),
    ),
  ]
  const explicitlyNamesSubject = [match.seed.canonicalName, match.matchedValue].some((name) =>
    containsNormalizedPhrase(evidenceSnippet, name),
  )
  let attribution: OpenFdaIngredientAttribution
  if (match.tier === 'secondary_generic_match' || match.ambiguous) {
    attribution = 'secondary_match_uncertain'
  } else if (activeIngredients.length > 1) {
    attribution = explicitlyNamesSubject
      ? 'multi_ingredient_attributable'
      : 'multi_ingredient_unattributed'
  } else if (
    activeIngredients.length === 1 &&
    (match.tier === 'exact_rxcui_match' ||
      activeIngredients[0] === normalizeOpenFdaName(match.seed.canonicalName) ||
      activeIngredients[0] === normalizeOpenFdaName(match.matchedValue))
  ) {
    attribution = 'direct_single_ingredient'
  } else if (explicitlyNamesSubject) {
    attribution = 'direct_substance_section'
  } else {
    attribution = 'secondary_match_uncertain'
  }
  return { attribution, activeIngredientCount: activeIngredients.length, explicitlyNamesSubject }
}

export function strongerOpenFdaAttribution(
  left: OpenFdaIngredientAttribution,
  right: OpenFdaIngredientAttribution,
) {
  return ATTRIBUTION_RANK[right] > ATTRIBUTION_RANK[left] ? right : left
}

export function isUnsafeOpenFdaAttribution(attribution: OpenFdaIngredientAttribution) {
  return ['multi_ingredient_unattributed', 'secondary_match_uncertain'].includes(attribution)
}

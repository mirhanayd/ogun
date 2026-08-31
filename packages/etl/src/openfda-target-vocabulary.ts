import type { OpenFdaTargetType } from './openfda-types'

export type OpenFdaTargetDefinition = {
  target: string
  type: OpenFdaTargetType
  pattern: RegExp
  generic?: boolean
}

export const OPENFDA_TARGET_VOCABULARY: readonly OpenFdaTargetDefinition[] = [
  { target: 'grapefruit_juice', type: 'food', pattern: /\bgrapefruit juice\b/gi },
  { target: 'grapefruit', type: 'food', pattern: /\bgrapefruit(?:s)?\b/gi },
  { target: 'vitamin_k', type: 'nutrient', pattern: /\bvitamin\s*k\b/gi },
  { target: 'tyramine', type: 'food_component', pattern: /\btyramine(?:-rich)?\b/gi },
  { target: 'caffeine', type: 'food_component', pattern: /\bcaffeine\b/gi },
  { target: 'calcium', type: 'nutrient', pattern: /\bcalcium(?:-containing)?\b/gi },
  { target: 'iron', type: 'nutrient', pattern: /\biron(?:-containing)?\b/gi },
  { target: 'magnesium', type: 'nutrient', pattern: /\bmagnesium(?:-containing)?\b/gi },
  { target: 'zinc', type: 'nutrient', pattern: /\bzinc(?:-containing)?\b/gi },
  { target: 'potassium', type: 'nutrient', pattern: /\bpotassium\b/gi },
  { target: 'sodium', type: 'nutrient', pattern: /\bsodium\b/gi },
  { target: 'protein', type: 'nutrient', pattern: /\bprotein(?:-rich)?\b/gi },
  { target: 'high_fat_meal', type: 'meal_timing', pattern: /\bhigh[- ]fat (?:meal|food)\b/gi },
  { target: 'fat', type: 'food_component', pattern: /\bdietary fat\b|\bfat content\b/gi },
  { target: 'dairy', type: 'food_group', pattern: /\bdairy(?: products?)?\b/gi },
  { target: 'milk', type: 'food', pattern: /\bmilk\b/gi },
  {
    target: 'enteral_nutrition',
    type: 'food_group',
    pattern: /\benteral (?:feeding|nutrition)\b|\btube feeding\b/gi,
  },
  {
    target: 'mineral_supplements',
    type: 'supplement',
    pattern: /\bmineral(?:-containing)? supplements?\b|\bmultiminerals?\b/gi,
  },
  { target: 'antacids', type: 'supplement', pattern: /\bantacids?\b/gi },
  {
    target: 'alcohol',
    type: 'alcohol',
    pattern: /\balcohol\b|\balcoholic beverages?\b|\bethanol\b/gi,
  },
  {
    target: 'fasting',
    type: 'meal_timing',
    pattern: /\bempty stomach\b|\bfast(?:ed|ing) (?:state|conditions?)\b/gi,
  },
  { target: 'bedtime', type: 'meal_timing', pattern: /\bat bedtime\b|\bbedtime\b/gi },
  {
    target: 'meals_general',
    type: 'meal_timing',
    pattern: /\bmeals?\b|\bwith food\b|\bwithout food\b/gi,
    generic: true,
  },
  {
    target: 'food_general',
    type: 'food',
    pattern: /\bfoods?\b|\bdiet(?:ary)?\b/gi,
    generic: true,
  },
] as const

export const OPENFDA_ALLOWED_TARGETS = new Set(
  OPENFDA_TARGET_VOCABULARY.map((definition) => definition.target),
)

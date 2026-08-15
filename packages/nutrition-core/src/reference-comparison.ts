import type { Sex } from './energy-requirement'
import type { NutrientValuesPer100g } from './types'

export interface ReferenceRange {
  nutrientCode: string
  // null: o yönde sınır yok (örn. üst sınırı olmayan bir besin öğesi için max: null).
  min: number | null
  max: number | null
  unit: string
}

export interface AgeGroupReference {
  ageGroupCode: string
  ageGroupLabel: string
  sex: Sex | 'all'
  ranges: ReferenceRange[]
}

export type ReferenceStatus = 'below' | 'within' | 'above' | 'no_reference'

export interface ReferenceComparisonResult {
  nutrientCode: string
  actualValue: number
  min: number | null
  max: number | null
  status: ReferenceStatus
}

// Hesaplanan plan değerlerini bir yaş grubunun referans aralıklarıyla karşılaştırır.
export function compareToReference(
  nutrients: NutrientValuesPer100g,
  reference: AgeGroupReference,
): ReferenceComparisonResult[] {
  return reference.ranges.map((range) => {
    const actualValue = nutrients[range.nutrientCode] ?? 0

    let status: ReferenceStatus
    if (range.min === null && range.max === null) {
      status = 'no_reference'
    } else if (range.min !== null && actualValue < range.min) {
      status = 'below'
    } else if (range.max !== null && actualValue > range.max) {
      status = 'above'
    } else {
      status = 'within'
    }

    return { nutrientCode: range.nutrientCode, actualValue, min: range.min, max: range.max, status }
  })
}

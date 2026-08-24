export interface OgunCorrection {
  recipeOrder: number
  nutrientCode: string
  valuePerPortion: number
  reason: string
}

// Kaynak OCR'ı virgülsüz sayılarda her zaman tek ondalık varsaymış. Aşağıdaki
// değerler yetişkin/çocuk ham satırları ve 4/4/9 Atwater eşitliği birlikte
// incelenerek düzeltilmiştir. Bu kapalı liste dışında sessiz tahmin yapılmaz.
export const OGUN_CORRECTIONS: OgunCorrection[] = [
  {
    recipeOrder: 10,
    nutrientCode: 'energy_kcal',
    valuePerPortion: 408,
    reason: 'adult=408, child=408; Atwater=401.6',
  },
  {
    recipeOrder: 10,
    nutrientCode: 'protein_g',
    valuePerPortion: 24.2,
    reason: 'child=24,2; adult token decimal lost',
  },
  {
    recipeOrder: 35,
    nutrientCode: 'carbohydrate_g',
    valuePerPortion: 12,
    reason: 'adult/child=12; percentages=9,2',
  },
  {
    recipeOrder: 35,
    nutrientCode: 'protein_g',
    valuePerPortion: 10,
    reason: 'adult/child=10; percentages and Atwater agree',
  },
  {
    recipeOrder: 36,
    nutrientCode: 'energy_kcal',
    valuePerPortion: 171.4,
    reason: 'child=1714; Atwater=170.7',
  },
  {
    recipeOrder: 38,
    nutrientCode: 'fat_g',
    valuePerPortion: 11,
    reason: 'amount token OCR=ll; adult percentage=16,9; Atwater=231.4',
  },
  {
    recipeOrder: 45,
    nutrientCode: 'energy_kcal',
    valuePerPortion: 539,
    reason: 'adult/child=539; child percentage=53,9',
  },
  {
    recipeOrder: 45,
    nutrientCode: 'fat_g',
    valuePerPortion: 29.9,
    reason: 'child=29,9; adult token decimal lost; Atwater=537.6',
  },
  {
    recipeOrder: 48,
    nutrientCode: 'carbohydrate_g',
    valuePerPortion: 7.1,
    reason: 'child=7,1; adult=7; Atwater=205.6',
  },
  {
    recipeOrder: 51,
    nutrientCode: 'energy_kcal',
    valuePerPortion: 143.9,
    reason: 'child=143,9; adult token decimal lost; Atwater=139.2',
  },
  {
    recipeOrder: 60,
    nutrientCode: 'fat_g',
    valuePerPortion: 10,
    reason: 'adult/child=10; percentages=15,4; Atwater=248.8',
  },
  {
    recipeOrder: 72,
    nutrientCode: 'fat_g',
    valuePerPortion: 8,
    reason: 'adult/child=8; percentages=12,3; Atwater=192.8',
  },
  {
    recipeOrder: 110,
    nutrientCode: 'fat_g',
    valuePerPortion: 7.1,
    reason: 'child=71; percentages=10,9; Atwater=315.9',
  },
  {
    recipeOrder: 115,
    nutrientCode: 'fat_g',
    valuePerPortion: 14,
    reason: 'adult/child=14; percentages=21,5; Atwater=526.4',
  },
]

const correctionByKey = new Map(
  OGUN_CORRECTIONS.map((correction) => [
    `${correction.recipeOrder}:${correction.nutrientCode}`,
    correction,
  ]),
)

export function getOgunCorrection(
  recipeOrder: number,
  nutrientCode: string,
): OgunCorrection | null {
  return correctionByKey.get(`${recipeOrder}:${nutrientCode}`) ?? null
}

export function perPortionToPer100g(valuePerPortion: number, portionWeightG: number): number {
  if (!Number.isFinite(valuePerPortion) || valuePerPortion < 0) {
    throw new Error(`Geçersiz porsiyon değeri: ${valuePerPortion}`)
  }
  if (!Number.isFinite(portionWeightG) || portionWeightG <= 0) {
    throw new Error(`Geçersiz porsiyon ağırlığı: ${portionWeightG}`)
  }
  return (valuePerPortion * 100) / portionWeightG
}

export function atwaterDeviationPercent(input: {
  energyKcal: number
  carbohydrateG: number
  proteinG: number
  fatG: number
}): number {
  if (input.energyKcal <= 0) return Number.POSITIVE_INFINITY
  const calculated = input.carbohydrateG * 4 + input.proteinG * 4 + input.fatG * 9
  return (Math.abs(calculated - input.energyKcal) / input.energyKcal) * 100
}

export function turkishDisplayName(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(
      /(^|[\s(/-])([\p{L}])/gu,
      (_, prefix: string, letter: string) => `${prefix}${letter.toLocaleUpperCase('tr-TR')}`,
    )
}

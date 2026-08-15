import { NUTRIENT, type NutrientValuesPer100g } from './types'

const ATWATER_FACTORS: Record<string, number> = {
  [NUTRIENT.PROTEIN]: 4,
  [NUTRIENT.CARB]: 4,
  [NUTRIENT.FAT]: 9,
  [NUTRIENT.ALCOHOL]: 7,
}

// Protein/karbonhidrat/yağ/alkolden Atwater enerji hesabı. packages/etl'deki
// basit sürümün (bkz. importers/bls.ts, importers/usda.ts) tam karşılığı —
// ETL doğrulamada, bu paket ise plan hesaplamada kullanır.
export function calculateAtwaterEnergyKcal(nutrientsPer100g: NutrientValuesPer100g): number {
  let kcal = 0
  for (const [code, factor] of Object.entries(ATWATER_FACTORS)) {
    kcal += (nutrientsPer100g[code] ?? 0) * factor
  }
  return kcal
}

export interface EnergyDiscrepancy {
  declaredKcal: number
  calculatedKcal: number
  deviationRatio: number
  isSuspicious: boolean
}

// ETL'deki Atwater doğrulamasıyla aynı eşik: beyan edilen enerji, hesaplanan
// enerjiden %10'dan fazla sapıyorsa şüpheli (muhtemelen veri hatası) sayılır.
const SUSPICIOUS_DEVIATION_RATIO = 0.1

export function compareEnergyToAtwater(nutrientsPer100g: NutrientValuesPer100g): EnergyDiscrepancy {
  const declaredKcal = nutrientsPer100g[NUTRIENT.ENERGY_KCAL] ?? 0
  const calculatedKcal = calculateAtwaterEnergyKcal(nutrientsPer100g)
  const deviationRatio = declaredKcal === 0 ? 0 : Math.abs(calculatedKcal - declaredKcal) / declaredKcal

  return {
    declaredKcal,
    calculatedKcal,
    deviationRatio,
    isSuspicious: deviationRatio > SUSPICIOUS_DEVIATION_RATIO,
  }
}

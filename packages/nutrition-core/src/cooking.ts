import type { NutrientValuesPer100g } from './types'

export interface YieldFactor {
  // Çiğ ağırlığın pişmiş ağırlığa oranı (örn. 0.75 → 100g çiğ, pişince 75g olur).
  ratio: number
}

export interface RetentionFactors {
  // Besin öğesi kodu → pişirmede kalan oran (0-1). Belirtilmeyen besin öğeleri
  // için 1 (kayıp yok) varsayılır.
  [nutrientCode: string]: number
}

export function rawGramsToCookedGrams(rawGrams: number, yieldFactor: YieldFactor): number {
  return rawGrams * yieldFactor.ratio
}

export function cookedGramsToRawGrams(cookedGrams: number, yieldFactor: YieldFactor): number {
  if (yieldFactor.ratio === 0) return 0
  return cookedGrams / yieldFactor.ratio
}

// Çiğ 100g değerlerini pişmiş 100g değerlerine çevirir. Sadece pişirme kaybı
// (retention factor) değil, ağırlık kaybından kaynaklanan yoğunlaşma etkisi de
// hesaba katılır — bu yüzden retention/yield ile bölünür, çarpılmaz.
// Örnek: tavuk göğsü pişince su kaybeder (yield 0.75), protein neredeyse hiç
// kaybolmaz (retention ~1); sonuç olarak pişmiş 100g'daki protein çiğden DAHA
// YÜKSEK çıkar (23g/0.75 ≈ 30.7g) — gerçek USDA verisiyle tutarlı bir davranış.
export function convertRawToCookedPer100g(
  nutrientsPer100gRaw: NutrientValuesPer100g,
  yieldFactor: YieldFactor,
  retentionFactors: RetentionFactors = {},
): NutrientValuesPer100g {
  if (yieldFactor.ratio === 0) {
    throw new Error('Yield factor 0 olamaz: pişmiş ağırlık sıfır demek besin kaybolmuş demektir.')
  }

  const result: NutrientValuesPer100g = {}
  for (const [code, valueRaw] of Object.entries(nutrientsPer100gRaw)) {
    const retention = retentionFactors[code] ?? 1
    result[code] = (valueRaw * retention) / yieldFactor.ratio
  }
  return result
}

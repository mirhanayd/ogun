import { describe, expect, it } from 'vitest'
import { convertRawToCookedPer100g, cookedGramsToRawGrams, rawGramsToCookedGrams } from './cooking'

describe('rawGramsToCookedGrams / cookedGramsToRawGrams', () => {
  it('çiğ gramı pişmiş grama çevirir ve geri döndürür', () => {
    const yieldFactor = { ratio: 0.75 }
    const cooked = rawGramsToCookedGrams(200, yieldFactor)
    expect(cooked).toBeCloseTo(150)
    expect(cookedGramsToRawGrams(cooked, yieldFactor)).toBeCloseTo(200)
  })

  it('yield factor 0 ise ters dönüşümde 0 döner (bölme hatasını önler)', () => {
    expect(cookedGramsToRawGrams(100, { ratio: 0 })).toBe(0)
  })
})

describe('convertRawToCookedPer100g', () => {
  it('golden test: tavuk göğsü — su kaybı proteini yoğunlaştırır', () => {
    // Çiğ tavuk göğsü (100g): ~120 kcal, 23g protein, 1g yağ.
    // Pişince ağırlığın %75'i kalır (yield 0.75), protein/yağ kaybı yok (retention 1).
    const rawPer100g = { ENERC_KCAL: 120, PROCNT: 23, FAT: 1 }
    const yieldFactor = { ratio: 0.75 }

    const cookedPer100g = convertRawToCookedPer100g(rawPer100g, yieldFactor, {})

    // Beklenen: çiğ değer / 0.75 (yoğunlaşma etkisi) — pişmiş 100g'da değerler
    // çiğden YÜKSEK çıkar, çünkü aynı besin öğesi miktarı artık daha az suda.
    expect(cookedPer100g.ENERC_KCAL).toBeCloseTo(160)
    expect(cookedPer100g.PROCNT).toBeCloseTo(30.667, 2)
    expect(cookedPer100g.FAT).toBeCloseTo(1.333, 2)
  })

  it('retention factor 1in altındaysa yoğunlaşma etkisini kısmen götürür', () => {
    // C vitamini pişirmede belirgin kaybolur (retention 0.5) — yoğunlaşma
    // etkisi olsa bile net sonuç çiğden düşük kalabilir.
    const rawPer100g = { VITC: 40 }
    const yieldFactor = { ratio: 0.75 }
    const retentionFactors = { VITC: 0.5 }

    const cookedPer100g = convertRawToCookedPer100g(rawPer100g, yieldFactor, retentionFactors)

    // 40 * 0.5 / 0.75 = 26.67 — çiğden (40) düşük.
    expect(cookedPer100g.VITC).toBeCloseTo(26.667, 2)
    expect(cookedPer100g.VITC).toBeLessThan(rawPer100g.VITC)
  })

  it('yield factor 0 için hata fırlatır', () => {
    expect(() => convertRawToCookedPer100g({ PROCNT: 10 }, { ratio: 0 })).toThrow()
  })
})

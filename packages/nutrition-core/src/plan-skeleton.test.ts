import { describe, expect, it } from 'vitest'
import {
  MACRO_DISTRIBUTION_PRESETS,
  calculateMacroTargets,
  distributeCalories,
} from './plan-skeleton'

describe('calculateMacroTargets', () => {
  it('dengeli (balanced) preset için grama çevirir', () => {
    // 2000 kcal, %20 protein / %50 karb / %30 yağ
    const result = calculateMacroTargets(2000, MACRO_DISTRIBUTION_PRESETS.balanced)
    expect(result.proteinG).toBeCloseTo((2000 * 0.2) / 4) // 100g
    expect(result.carbG).toBeCloseTo((2000 * 0.5) / 4) // 250g
    expect(result.fatG).toBeCloseTo((2000 * 0.3) / 9) // 66.67g
  })

  it('düşük karbonhidrat presetinde karb gramı düşer, yağ artar', () => {
    const balanced = calculateMacroTargets(2000, MACRO_DISTRIBUTION_PRESETS.balanced)
    const lowCarb = calculateMacroTargets(2000, MACRO_DISTRIBUTION_PRESETS.low_carb)
    expect(lowCarb.carbG).toBeLessThan(balanced.carbG)
    expect(lowCarb.fatG).toBeGreaterThan(balanced.fatG)
  })

  it('yüksek protein presetinde protein gramı en yüksektir', () => {
    const highProtein = calculateMacroTargets(2200, MACRO_DISTRIBUTION_PRESETS.high_protein)
    const balanced = calculateMacroTargets(2200, MACRO_DISTRIBUTION_PRESETS.balanced)
    expect(highProtein.proteinG).toBeGreaterThan(balanced.proteinG)
  })

  it('özel (custom) yüzdeler toplamı %100 ise kabul eder', () => {
    const result = calculateMacroTargets(1800, { proteinPct: 25, carbPct: 45, fatPct: 30 })
    expect(result.proteinG).toBeCloseTo((1800 * 0.25) / 4)
  })

  it('yüzdeler %100den sapıyorsa hata fırlatır', () => {
    expect(() =>
      calculateMacroTargets(1800, { proteinPct: 25, carbPct: 45, fatPct: 40 }),
    ).toThrow(/100/)
  })

  it('0.5 tolerans içindeki küçük yuvarlama sapmalarını kabul eder', () => {
    expect(() =>
      calculateMacroTargets(1800, { proteinPct: 25, carbPct: 45.2, fatPct: 30 }),
    ).not.toThrow()
  })

  it('negatif yüzdeleri reddeder', () => {
    expect(() => calculateMacroTargets(1800, { proteinPct: -5, carbPct: 75, fatPct: 30 })).toThrow(
      /negatif/,
    )
  })

  it('sıfır veya negatif hedef kaloriyi reddeder', () => {
    expect(() => calculateMacroTargets(0, MACRO_DISTRIBUTION_PRESETS.balanced)).toThrow()
    expect(() => calculateMacroTargets(-100, MACRO_DISTRIBUTION_PRESETS.balanced)).toThrow()
  })

  it('tüm preset yüzdeleri zaten %100 toplamına sahiptir', () => {
    for (const preset of Object.values(MACRO_DISTRIBUTION_PRESETS)) {
      expect(preset.proteinPct + preset.carbPct + preset.fatPct).toBe(100)
    }
  })
})

describe('distributeCalories', () => {
  it('eşit ağırlıklarda kaloriyi eşit dağıtır', () => {
    const result = distributeCalories(1800, [1, 1, 1])
    expect(result).toEqual([600, 600, 600])
    expect(result.reduce((a, b) => a + b, 0)).toBe(1800)
  })

  it('farklı ağırlıklarda orantılı dağıtır', () => {
    // kahvaltı %25, öğle %35, akşam %40
    const result = distributeCalories(2000, [0.25, 0.35, 0.4])
    expect(result).toEqual([500, 700, 800])
    expect(result.reduce((a, b) => a + b, 0)).toBe(2000)
  })

  it('toplam HER ZAMAN hedef kaloriye tam eşittir (yuvarlama sapması giderilir)', () => {
    // 1000/3 = 333.33... -> yuvarlama tutarsızlığı test eder
    const result = distributeCalories(1000, [1, 1, 1])
    expect(result.reduce((a, b) => a + b, 0)).toBe(1000)
  })

  it('tek bir öğün için tüm kaloriyi tek elemana verir', () => {
    expect(distributeCalories(1500, [1])).toEqual([1500])
  })

  it('6 öğünlük tipik bir dağılımda toplamı korur', () => {
    // kahvaltı, ara1, öğle, ara2, akşam, gece
    const weights = [0.2, 0.1, 0.25, 0.1, 0.25, 0.1]
    const result = distributeCalories(2400, weights)
    expect(result.reduce((a, b) => a + b, 0)).toBe(2400)
    expect(result).toHaveLength(6)
  })

  it('ağırlıklar normalize edilmemiş olsa da (toplamı 1 değil) doğru orantılar', () => {
    const result = distributeCalories(1200, [2, 2]) // toplam 4, ama orantı 1:1
    expect(result).toEqual([600, 600])
  })

  it('sıfır hedef kaloride tüm öğünler sıfır alır', () => {
    expect(distributeCalories(0, [1, 1])).toEqual([0, 0])
  })

  it('boş ağırlık dizisini reddeder', () => {
    expect(() => distributeCalories(2000, [])).toThrow()
  })

  it('negatif hedef kaloriyi reddeder', () => {
    expect(() => distributeCalories(-100, [1, 1])).toThrow()
  })

  it('toplamı sıfır olan ağırlıkları reddeder', () => {
    expect(() => distributeCalories(2000, [0, 0])).toThrow()
  })

  it('bir öğüne sıfır ağırlık verilebilir (diğerleri kalanı paylaşır)', () => {
    const result = distributeCalories(1000, [0, 1, 1])
    expect(result[0]).toBe(0)
    expect(result.reduce((a, b) => a + b, 0)).toBe(1000)
  })
})

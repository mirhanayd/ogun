import { describe, expect, it } from 'vitest'
import { calculateAtwaterEnergyKcal, compareEnergyToAtwater } from './energy'

describe('calculateAtwaterEnergyKcal', () => {
  it('protein/karbonhidrat/yağdan 4-4-9 ile enerji hesaplar', () => {
    const kcal = calculateAtwaterEnergyKcal({ PROCNT: 10, CHOCDF: 20, FAT: 5 })
    expect(kcal).toBeCloseTo(10 * 4 + 20 * 4 + 5 * 9)
  })

  it('alkolü 7 kcal/g ile dahil eder', () => {
    const kcal = calculateAtwaterEnergyKcal({ ALC: 10 })
    expect(kcal).toBeCloseTo(70)
  })

  it('eksik makro değerleri 0 kabul eder', () => {
    expect(calculateAtwaterEnergyKcal({})).toBe(0)
  })
})

describe('compareEnergyToAtwater', () => {
  it('beyan edilen ve hesaplanan enerji uyumluysa şüpheli değildir', () => {
    const result = compareEnergyToAtwater({ ENERC_KCAL: 165, PROCNT: 10, CHOCDF: 20, FAT: 5 })
    expect(result.isSuspicious).toBe(false)
  })

  it('%10 sınırının altındaki sapmayı şüpheli saymaz', () => {
    const result = compareEnergyToAtwater({ ENERC_KCAL: 110, PROCNT: 10, CHOCDF: 15, FAT: 0 })
    expect(result.deviationRatio).toBeLessThan(0.1)
    expect(result.isSuspicious).toBe(false)
  })

  it('%10 sınırının üzerindeki sapmayı şüpheli sayar', () => {
    const result = compareEnergyToAtwater({ ENERC_KCAL: 90, PROCNT: 10, CHOCDF: 15, FAT: 0 })
    expect(result.deviationRatio).toBeGreaterThan(0.1)
    expect(result.isSuspicious).toBe(true)
  })

  it('beyan edilen enerji 0 ise sapmayı 0 kabul eder (bölme hatasını önler)', () => {
    const result = compareEnergyToAtwater({ PROCNT: 10 })
    expect(result.deviationRatio).toBe(0)
    expect(result.isSuspicious).toBe(false)
  })
})

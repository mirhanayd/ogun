import { describe, expect, it } from 'vitest'
import {
  calculateBmi,
  calculateIdealWeightRange,
  calculateWaistHeightRatio,
  calculateWaistHipRatio,
  classifyBmi,
  summarizeBodyComposition,
} from './body-composition'

describe('calculateBmi', () => {
  it('kilo / boy(m)² hesaplar', () => {
    // 80kg, 180cm -> 80 / 1.8² = 24.691...
    expect(calculateBmi(80, 180)).toBeCloseTo(24.6914, 4)
  })
})

describe('classifyBmi', () => {
  it('18.5 altını zayıf sayar', () => {
    expect(classifyBmi(18.4)).toBe('zayıf')
  })
  it('18.5-24.9 arasını normal sayar', () => {
    expect(classifyBmi(18.5)).toBe('normal')
    expect(classifyBmi(24.9)).toBe('normal')
  })
  it('25-29.9 arasını fazla kilolu sayar', () => {
    expect(classifyBmi(27)).toBe('fazla_kilolu')
  })
  it('30 ve üzerini obez sayar', () => {
    expect(classifyBmi(31)).toBe('obez')
  })
})

describe('calculateWaistHipRatio', () => {
  it('bel / kalça oranını hesaplar', () => {
    expect(calculateWaistHipRatio(80, 100)).toBeCloseTo(0.8)
  })
})

describe('calculateWaistHeightRatio', () => {
  it('bel / boy oranını hesaplar', () => {
    expect(calculateWaistHeightRatio(90, 180)).toBeCloseTo(0.5)
  })
})

describe('calculateIdealWeightRange', () => {
  it('180cm için sağlıklı BKİ aralığına karşılık gelen kilo aralığını döner', () => {
    const range = calculateIdealWeightRange(180)
    // 18.5 * 1.8² = 59.94, 24.9 * 1.8² = 80.676
    expect(range.minKg).toBeCloseTo(59.94, 2)
    expect(range.maxKg).toBeCloseTo(80.676, 2)
  })
})

describe('summarizeBodyComposition', () => {
  it('tüm girdiler doluyken tüm alanları hesaplar', () => {
    const summary = summarizeBodyComposition({
      weightKg: 80,
      heightCm: 180,
      waistCm: 90,
      hipCm: 100,
    })
    expect(summary.bmi).toBeCloseTo(24.6914, 4)
    expect(summary.bmiCategory).toBe('normal')
    expect(summary.waistHipRatio).toBeCloseTo(0.9)
    expect(summary.waistHeightRatio).toBeCloseTo(0.5)
    expect(summary.idealWeightRange).not.toBeNull()
  })

  it('eksik girdilerde ilgili alanları null bırakır', () => {
    const summary = summarizeBodyComposition({
      weightKg: 80,
      heightCm: null,
      waistCm: null,
      hipCm: null,
    })
    expect(summary.bmi).toBeNull()
    expect(summary.bmiCategory).toBeNull()
    expect(summary.waistHipRatio).toBeNull()
    expect(summary.waistHeightRatio).toBeNull()
    expect(summary.idealWeightRange).toBeNull()
  })
})

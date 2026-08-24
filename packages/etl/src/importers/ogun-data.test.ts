import { describe, expect, it } from 'vitest'
import {
  atwaterDeviationPercent,
  getOgunCorrection,
  perPortionToPer100g,
  turkishDisplayName,
} from './ogun-data'

describe('Öğün Türk yemekleri ETL yardımcıları', () => {
  it('porsiyon değerini 100 grama dönüştürür', () => {
    expect(perPortionToPer100g(413.8, 300)).toBeCloseTo(137.9333, 4)
  })

  it('geçersiz porsiyon ağırlığını reddeder', () => {
    expect(() => perPortionToPer100g(10, 0)).toThrow('Geçersiz porsiyon ağırlığı')
  })

  it('kanıtlı OCR düzeltmesini uygular', () => {
    expect(getOgunCorrection(45, 'energy_kcal')?.valuePerPortion).toBe(539)
    expect(getOgunCorrection(1, 'energy_kcal')).toBeNull()
  })

  it('Atwater sapmasını yüzde olarak hesaplar', () => {
    expect(
      atwaterDeviationPercent({ energyKcal: 408, carbohydrateG: 12.3, proteinG: 24.2, fatG: 28.4 }),
    ).toBeLessThan(2)
  })

  it('Türkçe büyük harfli kaynak adını okunabilir biçime getirir', () => {
    expect(turkishDisplayName('ZEYTİNYAĞLI BRÜKSEL LAHANASI')).toBe('Zeytinyağlı Brüksel Lahanası')
  })
})

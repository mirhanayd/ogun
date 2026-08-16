import { describe, expect, it } from 'vitest'
import { toAllergenEntries } from './client-health'

// Besin alerjisi/intoleransı normalizasyonu (GitHub issue #19 / Prompt 4.3,
// GÖREV 1) — plan editörünün (gelecekteki issue) ileride
// foods.searchText'e karşı basit içerme kontrolü yapabilmesi için her
// girişin bir "normalized" alanı olmalı (bkz. schema/clients.ts
// ClientAllergenEntry üstündeki not).
describe('toAllergenEntries', () => {
  it('Türkçe karakterleri normalize eder (ı,ş,ğ,ü,ö,ç → ascii, küçük harf)', () => {
    const result = toAllergenEntries([{ id: '1', label: 'Yer Fıstığı', severity: null, note: null }])
    expect(result).toEqual([
      { id: '1', label: 'Yer Fıstığı', normalized: 'yer fistigi', severity: null, note: null },
    ])
  })

  it('baştaki/sondaki boşlukları kırpar', () => {
    const result = toAllergenEntries([{ id: '1', label: '  laktoz  ', severity: null, note: null }])
    expect(result[0]?.label).toBe('laktoz')
    expect(result[0]?.normalized).toBe('laktoz')
  })

  it('boş (sadece boşluktan oluşan) girişleri filtreler', () => {
    const result = toAllergenEntries([
      { id: '1', label: '   ', severity: null, note: null },
      { id: '2', label: 'gluten', severity: null, note: null },
    ])
    expect(result).toHaveLength(1)
    expect(result[0]?.label).toBe('gluten')
  })

  it('şiddet ve not alanlarını olduğu gibi korur', () => {
    const result = toAllergenEntries([
      { id: '1', label: 'kabuklu deniz ürünleri', severity: 'şiddetli', note: 'anafilaksi öyküsü var' },
    ])
    expect(result[0]).toMatchObject({ severity: 'şiddetli', note: 'anafilaksi öyküsü var' })
  })

  it('boş bir liste için boş dizi döner', () => {
    expect(toAllergenEntries([])).toEqual([])
  })

  it('birden fazla girişi sırasını koruyarak dönüştürür', () => {
    const result = toAllergenEntries([
      { id: '1', label: 'fıstık', severity: null, note: null },
      { id: '2', label: 'süt', severity: null, note: null },
      { id: '3', label: 'yumurta', severity: null, note: null },
    ])
    expect(result.map((entry) => entry.id)).toEqual(['1', '2', '3'])
  })

  it('aynı normalize sonucunu üreten farklı yazımları AYRI kayıtlar olarak korur (deduplication burada YAPILMAZ)', () => {
    // Not: "Süt" ve "sut" aynı normalized değere sahip olabilir ama bu
    // fonksiyon dedup YAPMAZ — diyetisyenin AYRI notlarla (ör. farklı
    // şiddet) girdiği iki kayıt birleştirilmemeli, o karar UI katmanında.
    const result = toAllergenEntries([
      { id: '1', label: 'Süt', severity: 'hafif', note: null },
      { id: '2', label: 'sut', severity: 'şiddetli', note: null },
    ])
    expect(result).toHaveLength(2)
    expect(result[0]?.normalized).toBe(result[1]?.normalized)
  })
})

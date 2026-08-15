import { describe, expect, it } from 'vitest'
import { gramsToPortionQuantity, portionToGrams, scaleNutrientsToGrams } from './portion'

describe('scaleNutrientsToGrams', () => {
  it('100g başına değerleri gram miktarına ölçekler', () => {
    const result = scaleNutrientsToGrams({ ENERC_KCAL: 200, PROCNT: 20 }, 150)
    expect(result.ENERC_KCAL).toBeCloseTo(300)
    expect(result.PROCNT).toBeCloseTo(30)
  })

  it('0 gram için tüm değerleri 0 döner', () => {
    const result = scaleNutrientsToGrams({ ENERC_KCAL: 200 }, 0)
    expect(result.ENERC_KCAL).toBe(0)
  })
})

describe('portionToGrams', () => {
  it('adet belirtilmediğinde porsiyonun gramını döner', () => {
    expect(portionToGrams({ label: '1 kase', grams: 250 })).toBe(250)
  })

  it('adet belirtildiğinde çarpar', () => {
    expect(portionToGrams({ label: '1 kase', grams: 250 }, 2)).toBe(500)
  })
})

describe('gramsToPortionQuantity', () => {
  it('gramı porsiyon adetine çevirir', () => {
    expect(gramsToPortionQuantity({ label: '1 kase', grams: 250 }, 300)).toBeCloseTo(1.2)
  })

  it('porsiyon gramı 0 ise 0 döner (bölme hatasını önler)', () => {
    expect(gramsToPortionQuantity({ label: 'bilinmiyor', grams: 0 }, 300)).toBe(0)
  })
})

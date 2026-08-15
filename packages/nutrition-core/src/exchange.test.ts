import { describe, expect, it } from 'vitest'
import { exchangesToGrams, exchangesToNutrients, gramsToExchanges, type ExchangeGroupDefinition } from './exchange'

const meatExchange: ExchangeGroupDefinition = {
  code: 'MEAT',
  nameTr: 'Et değişimi',
  gramsPerExchange: 30,
  nutrientsPerExchange: { ENERC_KCAL: 75, PROCNT: 7 },
}

describe('gramsToExchanges / exchangesToGrams', () => {
  it('gramı değişim adedine çevirir', () => {
    expect(gramsToExchanges(90, meatExchange)).toBeCloseTo(3)
  })

  it('değişim adedini grama çevirir', () => {
    expect(exchangesToGrams(3, meatExchange)).toBeCloseTo(90)
  })

  it('gramsPerExchange 0 ise 0 döner (bölme hatasını önler)', () => {
    expect(gramsToExchanges(90, { ...meatExchange, gramsPerExchange: 0 })).toBe(0)
  })
})

describe('exchangesToNutrients', () => {
  it('değişim adedinin toplam besin öğesi değerini hesaplar', () => {
    const result = exchangesToNutrients(2.5, meatExchange)
    expect(result.ENERC_KCAL).toBeCloseTo(75 * 2.5)
    expect(result.PROCNT).toBeCloseTo(7 * 2.5)
  })
})

import { describe, expect, it } from 'vitest'
import {
  computeMealNutrientTotals,
  resolveGramsFromSelection,
  sumMealTotals,
  type FoodMacroLookup,
} from './plan-nutrients'

// GitHub issue #25 / Prompt 5.3 — "öğün toplamı hesaplama bağlantısı"
// testleri: bu dosya nutrition-core'un calculateMealNutrients'ını
// ÇAĞIRIYOR (paralel bir hesap yolu değil), o yüzden burada test edilen
// asıl şey plan_items -> nutrition-core Meal/MealItem dönüşümünün doğru
// yapıldığı.
describe('computeMealNutrientTotals', () => {
  const chicken: FoodMacroLookup = {
    id: 'food-1',
    nameTr: 'Tavuk göğsü',
    kcalPer100g: 165,
    proteinPer100g: 31,
    carbPer100g: 0,
    fatPer100g: 3.6,
  }
  const rice: FoodMacroLookup = {
    id: 'food-2',
    nameTr: 'Pirinç pilavı',
    kcalPer100g: 130,
    proteinPer100g: 2.7,
    carbPer100g: 28,
    fatPer100g: 0.3,
  }

  it('birden fazla kalemin gram bazlı toplamını doğru hesaplar', () => {
    const lookup = new Map([
      ['food-1', chicken],
      ['food-2', rice],
    ])
    const totals = computeMealNutrientTotals(
      [
        { foodId: 'food-1', amountGrams: 150 },
        { foodId: 'food-2', amountGrams: 200 },
      ],
      lookup,
    )

    expect(totals.kcalTotal).toBeCloseTo(165 * 1.5 + 130 * 2, 5)
    expect(totals.proteinGrams).toBeCloseTo(31 * 1.5 + 2.7 * 2, 5)
    expect(totals.carbGrams).toBeCloseTo(0 * 1.5 + 28 * 2, 5)
    expect(totals.fatGrams).toBeCloseTo(3.6 * 1.5 + 0.3 * 2, 5)
    expect(totals.uncalculatedItemCount).toBe(0)
  })

  it('besin verisi bulunamayan (serbest metin/eksik) kalemleri sessizce YUTMAZ', () => {
    const lookup = new Map([['food-1', chicken]])
    const totals = computeMealNutrientTotals(
      [
        { foodId: 'food-1', amountGrams: 100 },
        { foodId: null, amountGrams: 50 }, // freeText kalem
        { foodId: 'food-missing', amountGrams: 30 }, // indekste yok
      ],
      lookup,
    )

    expect(totals.uncalculatedItemCount).toBe(2)
    expect(totals.kcalTotal).toBeCloseTo(165, 5)
  })

  it('boş kalem listesinde sıfır döner', () => {
    expect(computeMealNutrientTotals([], new Map())).toEqual({
      kcalTotal: 0,
      proteinGrams: 0,
      carbGrams: 0,
      fatGrams: 0,
      uncalculatedItemCount: 0,
    })
  })
})

describe('sumMealTotals', () => {
  it('birden fazla öğün toplamını gün toplamına indirger', () => {
    const sum = sumMealTotals([
      { kcalTotal: 100, proteinGrams: 10, carbGrams: 5, fatGrams: 2, uncalculatedItemCount: 1 },
      { kcalTotal: 200, proteinGrams: 20, carbGrams: 10, fatGrams: 4, uncalculatedItemCount: 0 },
    ])
    expect(sum).toEqual({
      kcalTotal: 300,
      proteinGrams: 30,
      carbGrams: 15,
      fatGrams: 6,
      uncalculatedItemCount: 1,
    })
  })
})

describe('resolveGramsFromSelection', () => {
  it('"gr" birimini doğrudan grama çevirir', () => {
    expect(resolveGramsFromSelection({ amount: 150, unit: 'g', defaultPortion: null })).toEqual({
      grams: 150,
      noteHint: null,
    })
  })

  it('"kg" birimini 1000 ile çarpar', () => {
    expect(resolveGramsFromSelection({ amount: 1.5, unit: 'kg', defaultPortion: null })).toEqual({
      grams: 1500,
      noteHint: null,
    })
  })

  it('porsiyon ifadesi + varsayılan porsiyon varsa gramı hesaplar ve not bırakır', () => {
    const result = resolveGramsFromSelection({
      amount: 2,
      portion: 'kase',
      defaultPortion: { label: '1 kase', grams: 250 },
    })
    expect(result.grams).toBe(500)
    expect(result.noteHint).toBe('2 kase')
  })

  it('birim/porsiyon hiç yazılmadıysa ve varsayılan porsiyon varsa "adet" gibi davranır', () => {
    const result = resolveGramsFromSelection({
      amount: 1,
      defaultPortion: { label: '1 orta boy', grams: 150 },
    })
    expect(result.grams).toBe(150)
    expect(result.noteHint).toBeNull()
  })

  it('hiçbir ipucu yoksa (birim/porsiyon/varsayılan) miktarı grama eşitler', () => {
    expect(resolveGramsFromSelection({ amount: 200, defaultPortion: null })).toEqual({
      grams: 200,
      noteHint: null,
    })
  })
})

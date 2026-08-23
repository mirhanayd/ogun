import { describe, expect, it } from 'vitest'
import type { AgeGroupReference } from '@ogun/nutrition-core'
import { buildLivePanelData, type FoodNutrientLookup } from './plan-live-panel'
import type { DraftDay } from '@/app/(app)/danisanlar/[id]/planlar/[planId]/plan-editor-store'

// GitHub issue #26 / Prompt 5.4 — buildLivePanelData'nın DraftDay[] ->
// nutrition-core dönüşümünün doğru yapıldığını doğrular (plan-nutrients.test.ts
// ile AYNI felsefe: gerçek hesap zaten nutrition-core'da test edildi, burada
// test edilen tek şey Zustand taslağından doğru Meal/MealItem üretilmesi).
function draftDay(overrides: Partial<DraftDay> = {}): DraftDay {
  return {
    id: 'day-1',
    dayNumber: 1,
    dayLabel: null,
    meals: [],
    ...overrides,
  }
}

const chicken: FoodNutrientLookup = {
  id: 'food-1',
  nameTr: 'Tavuk göğsü',
  nutrientsPer100g: { ENERC_KCAL: 165, PROCNT: 31, FAT: 3.6, CHOCDF: 0, FE: 1 },
  hasImputedValues: false,
}

describe('buildLivePanelData', () => {
  it('tek günlük plan için toplam besin öğesi değerlerini doğru hesaplar', () => {
    const days: DraftDay[] = [
      draftDay({
        meals: [
          {
            id: 'meal-1',
            dayId: 'day-1',
            mealType: 'kahvaltı',
            time: null,
            name: 'Kahvaltı',
            sortOrder: 0,
            items: [
              {
                id: 'item-1',
                mealId: 'meal-1',
                foodId: 'food-1',
                recipeId: null,
                freeText: null,
                amountGrams: 200,
                note: null,
                sortOrder: 0,
                isOptional: false,
                alternatives: [],
              },
            ],
          },
        ],
      }),
    ]
    const foodLookup = new Map([['food-1', chicken]])

    const result = buildLivePanelData({
      days,
      foodLookup,
      targetKcal: 2000,
      reference: null,
      coreNutrientCodes: ['FE'],
    })

    expect(result.totalNutrients.ENERC_KCAL).toBeCloseTo(330)
    expect(result.totalNutrients.PROCNT).toBeCloseTo(62)
    expect(result.dayCount).toBe(1)
    expect(result.mealEnergyShares).toHaveLength(1)
    expect(result.mealEnergyShares[0]?.percentOfDailyTotal).toBeCloseTo(100)
    expect(result.nutrientLevels.find((level) => level.nutrientCode === 'FE')).toMatchObject({
      actualValue: 2,
      band: 'no_reference',
      percentOfReference: null,
    })
  })

  it('çok günlük planlarda toplamı gün sayısına bölerek "günlük ortalama" döner', () => {
    const days: DraftDay[] = [
      draftDay({
        id: 'day-1',
        dayNumber: 1,
        meals: [
          {
            id: 'meal-1',
            dayId: 'day-1',
            mealType: 'kahvaltı',
            time: null,
            name: 'Kahvaltı',
            sortOrder: 0,
            items: [
              {
                id: 'item-1',
                mealId: 'meal-1',
                foodId: 'food-1',
                recipeId: null,
                freeText: null,
                amountGrams: 200,
                note: null,
                sortOrder: 0,
                isOptional: false,
                alternatives: [],
              },
            ],
          },
        ],
      }),
      draftDay({
        id: 'day-2',
        dayNumber: 2,
        meals: [
          {
            id: 'meal-2',
            dayId: 'day-2',
            mealType: 'kahvaltı',
            time: null,
            name: 'Kahvaltı',
            sortOrder: 0,
            items: [
              {
                id: 'item-2',
                mealId: 'meal-2',
                foodId: 'food-1',
                recipeId: null,
                freeText: null,
                amountGrams: 200,
                note: null,
                sortOrder: 0,
                isOptional: false,
                alternatives: [],
              },
            ],
          },
        ],
      }),
    ]
    const foodLookup = new Map([['food-1', chicken]])

    const result = buildLivePanelData({
      days,
      foodLookup,
      targetKcal: null,
      reference: null,
      coreNutrientCodes: [],
    })

    // 2 gün, her günde 330 kcal → günlük ortalama 330 kcal (toplam 660 DEĞİL).
    expect(result.totalNutrients.ENERC_KCAL).toBeCloseTo(330)
    expect(result.dayCount).toBe(2)
  })

  it('referans verilmişse mikro besin öğesi bantlamasını üretir', () => {
    const days: DraftDay[] = [
      draftDay({
        meals: [
          {
            id: 'meal-1',
            dayId: 'day-1',
            mealType: 'kahvaltı',
            time: null,
            name: 'Kahvaltı',
            sortOrder: 0,
            items: [
              {
                id: 'item-1',
                mealId: 'meal-1',
                foodId: 'food-1',
                recipeId: null,
                freeText: null,
                amountGrams: 100,
                note: null,
                sortOrder: 0,
                isOptional: false,
                alternatives: [],
              },
            ],
          },
        ],
      }),
    ]
    const foodLookup = new Map([['food-1', chicken]])
    const reference: AgeGroupReference = {
      ageGroupCode: 'TEST',
      ageGroupLabel: 'Test',
      sex: 'all',
      ranges: [{ nutrientCode: 'FE', min: 18, max: 45, unit: 'mg' }],
    }

    const result = buildLivePanelData({
      days,
      foodLookup,
      targetKcal: null,
      reference,
      coreNutrientCodes: ['FE'],
    })

    const ironLevel = result.nutrientLevels.find((n) => n.nutrientCode === 'FE')
    expect(ironLevel?.band).toBe('low') // 1mg / 18mg RDA ≈ %5.5
  })

  it('freeText/eşleşmeyen kalemleri hesaba katmadan sessizce atlar', () => {
    const days: DraftDay[] = [
      draftDay({
        meals: [
          {
            id: 'meal-1',
            dayId: 'day-1',
            mealType: 'kahvaltı',
            time: null,
            name: 'Kahvaltı',
            sortOrder: 0,
            items: [
              {
                id: 'item-1',
                mealId: 'meal-1',
                foodId: null,
                recipeId: null,
                freeText: 'ev yapımı çorba',
                amountGrams: 250,
                note: null,
                sortOrder: 0,
                isOptional: false,
                alternatives: [],
              },
            ],
          },
        ],
      }),
    ]

    const result = buildLivePanelData({
      days,
      foodLookup: new Map(),
      targetKcal: null,
      reference: null,
      coreNutrientCodes: [],
    })

    expect(result.totalNutrients.ENERC_KCAL ?? 0).toBe(0)
  })
})

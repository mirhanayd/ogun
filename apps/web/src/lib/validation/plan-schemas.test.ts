import { describe, expect, it } from 'vitest'
import {
  planItemInputSchema,
  planItemUpdateSchema,
  planInputSchema,
  reorderItemsSchema,
} from './plan-schemas'

// GitHub issue #23 / Prompt 5.1 — plan_items/plan_item_alternatives'ın DB
// CHECK kısıtıyla (bkz. packages/db/src/schema/plans.ts
// exactlyOneItemSourceCheck) AYNI invaryantın Zod katmanındaki karşılığı:
// "foodId, recipeId, freeText'ten TAM OLARAK biri dolu olmalı".
describe('planItemInputSchema — tam olarak bir kaynak kuralı', () => {
  it('sadece freeText doluysa geçerlidir', () => {
    const result = planItemInputSchema.safeParse({ freeText: '1 avuç kuruyemiş', amount: 30 })
    expect(result.success).toBe(true)
  })

  it('sadece foodId doluysa geçerlidir', () => {
    const result = planItemInputSchema.safeParse({ foodId: 'food_1', amount: 100 })
    expect(result.success).toBe(true)
  })

  it('sadece recipeId doluysa geçerlidir', () => {
    const result = planItemInputSchema.safeParse({ recipeId: 'recipe_1', amount: 1 })
    expect(result.success).toBe(true)
  })

  it('hiçbiri dolu değilse reddedilir', () => {
    const result = planItemInputSchema.safeParse({ amount: 100 })
    expect(result.success).toBe(false)
  })

  it('foodId + recipeId birlikte doluysa reddedilir', () => {
    const result = planItemInputSchema.safeParse({ foodId: 'food_1', recipeId: 'recipe_1', amount: 100 })
    expect(result.success).toBe(false)
  })

  it('foodId + freeText birlikte doluysa reddedilir', () => {
    const result = planItemInputSchema.safeParse({ foodId: 'food_1', freeText: 'ikisi birden', amount: 100 })
    expect(result.success).toBe(false)
  })

  it('üçü birden doluysa reddedilir', () => {
    const result = planItemInputSchema.safeParse({
      foodId: 'food_1',
      recipeId: 'recipe_1',
      freeText: 'üçü birden',
      amount: 100,
    })
    expect(result.success).toBe(false)
  })

  it('boşluktan ibaret freeText, alanın kendi min(1) kuralıyla zaten reddedilir', () => {
    // Not: freeText alanının kendi .trim().min(1) kuralı, "tam olarak bir
    // kaynak" .refine()'ından ÖNCE devreye girer — boşluktan ibaret bir
    // freeText hiçbir zaman geçerli bir "dolu" değer sayılmaz.
    const result = planItemInputSchema.safeParse({ foodId: 'food_1', freeText: '   ', amount: 100 })
    expect(result.success).toBe(false)
  })

  it('freeText tamamen gönderilmezse (undefined) ve foodId doluysa geçerlidir', () => {
    const result = planItemInputSchema.safeParse({ foodId: 'food_1', amount: 100 })
    expect(result.success).toBe(true)
  })

  it('amount 0 veya negatifse reddedilir', () => {
    expect(planItemInputSchema.safeParse({ freeText: 'x', amount: 0 }).success).toBe(false)
    expect(planItemInputSchema.safeParse({ freeText: 'x', amount: -5 }).success).toBe(false)
  })
})

describe('planItemUpdateSchema — kısmi güncellemede kural sadece kaynak alanı DOKUNULDUYSA uygulanır', () => {
  it('hiçbir kaynak alanı gönderilmeden sadece amount güncellemesi geçerlidir', () => {
    const result = planItemUpdateSchema.safeParse({ amount: 50 })
    expect(result.success).toBe(true)
  })

  it('foodId tek başına güncelleniyorsa (recipeId/freeText dokunulmadıysa) geçerlidir', () => {
    const result = planItemUpdateSchema.safeParse({ foodId: 'food_2' })
    expect(result.success).toBe(true)
  })

  it('foodId + recipeId birlikte güncellenmeye çalışılırsa reddedilir', () => {
    const result = planItemUpdateSchema.safeParse({ foodId: 'food_2', recipeId: 'recipe_2' })
    expect(result.success).toBe(false)
  })

  it('foodId açıkça null yapılırken recipeId de null ise (ikisi de "dokunulmuş" ama boş) reddedilir', () => {
    const result = planItemUpdateSchema.safeParse({ foodId: null, recipeId: null })
    expect(result.success).toBe(false)
  })
})

describe('planInputSchema', () => {
  it('sadece name ile (en asgari) geçerlidir', () => {
    const result = planInputSchema.safeParse({ name: 'Yeni plan' })
    expect(result.success).toBe(true)
  })

  it('boş isim reddedilir', () => {
    const result = planInputSchema.safeParse({ name: '' })
    expect(result.success).toBe(false)
  })

  it('clientId null olabilir (şablon)', () => {
    const result = planInputSchema.safeParse({ name: 'Şablon', clientId: null, isTemplate: true })
    expect(result.success).toBe(true)
  })

  it('geçersiz planType reddedilir', () => {
    const result = planInputSchema.safeParse({ name: 'Plan', planType: 'aylık' })
    expect(result.success).toBe(false)
  })
})

describe('reorderItemsSchema', () => {
  it('boş orderedItemIds listesi reddedilir', () => {
    const result = reorderItemsSchema.safeParse({ mealId: 'meal_1', orderedItemIds: [] })
    expect(result.success).toBe(false)
  })

  it('geçerli bir sıralama isteği kabul edilir', () => {
    const result = reorderItemsSchema.safeParse({ mealId: 'meal_1', orderedItemIds: ['item_1', 'item_2'] })
    expect(result.success).toBe(true)
  })
})

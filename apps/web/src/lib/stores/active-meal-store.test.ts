import { describe, expect, it, beforeEach } from 'vitest'
import { useActiveMealStore } from './active-meal-store'
import type { FoodSearchHit } from '@/lib/food-index'

const sampleHit: FoodSearchHit = {
  id: 'food-1',
  nameTr: 'Elma',
  groupNameTr: 'Meyve',
  kcalPer100g: 52,
  proteinPer100g: 0.3,
  carbPer100g: 14,
  fatPer100g: 0.2,
  ingredientNames: [],
  defaultPortion: { label: '1 orta boy', grams: 150 },
}

// GitHub issue #25 / Prompt 5.3 — "aktif öğün" store dilimi testleri. Bu
// store command-palette.tsx'in besin seçimini plan editöründeki doğru
// öğün bloğuna yönlendiren mekanizma (bkz. lib/stores/active-meal-store.ts
// dosya başı notu).
describe('useActiveMealStore', () => {
  beforeEach(() => {
    useActiveMealStore.setState({ activeMealId: null, activeMealLabel: null, handler: null })
  })

  it('aktif öğün yokken addFoodToActiveMeal false döner (fallback tetiklenmeli)', () => {
    const added = useActiveMealStore.getState().addFoodToActiveMeal(sampleHit)
    expect(added).toBe(false)
  })

  it("setActiveMeal sonrası addFoodToActiveMeal handler'ı çağırır ve true döner", () => {
    let received: FoodSearchHit | null = null
    useActiveMealStore.getState().setActiveMeal('meal-1', 'Kahvaltı', (hit) => {
      received = hit
    })

    const added = useActiveMealStore.getState().addFoodToActiveMeal(sampleHit)

    expect(added).toBe(true)
    expect(received).toEqual(sampleHit)
  })

  it('clearActiveMeal(mealId) sadece o öğün hâlâ aktifse temizler', () => {
    useActiveMealStore.getState().setActiveMeal('meal-1', 'Kahvaltı', () => {})
    useActiveMealStore.getState().setActiveMeal('meal-2', 'Öğle', () => {})

    // meal-1 artık aktif DEĞİL (meal-2 onun yerini aldı) — meal-1'in unmount
    // temizliği meal-2'yi YANLIŞLIKLA silmemeli.
    useActiveMealStore.getState().clearActiveMeal('meal-1')

    expect(useActiveMealStore.getState().activeMealId).toBe('meal-2')
  })

  it('clearActiveMeal(mealId) eşleşirse temizler', () => {
    useActiveMealStore.getState().setActiveMeal('meal-1', 'Kahvaltı', () => {})
    useActiveMealStore.getState().clearActiveMeal('meal-1')
    expect(useActiveMealStore.getState().activeMealId).toBeNull()
  })

  it('clearActiveMeal() argümansız her zaman temizler', () => {
    useActiveMealStore.getState().setActiveMeal('meal-1', 'Kahvaltı', () => {})
    useActiveMealStore.getState().clearActiveMeal()
    expect(useActiveMealStore.getState().activeMealId).toBeNull()
  })
})

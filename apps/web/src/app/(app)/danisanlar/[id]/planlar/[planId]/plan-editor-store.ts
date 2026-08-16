'use client'

import { create } from 'zustand'
import type { PlanMealType } from '@ogun/db/schema'
import type { PlanTree } from '@ogun/db/queries'
import {
  addAlternativeAction,
  addItemAction,
  moveItemAction,
  removeAlternativeAction,
  removeItemAction,
  reorderItemsAction,
  updateItemAction,
  updateMealAction,
  updatePlanAction,
} from '@/app/(app)/planlar/actions'
import type { FoodSearchSelection } from '@/components/food-search-input'
import { getFoodIndexEntriesByIds } from '@/lib/food-index'
import { resolveGramsFromSelection, type FoodMacroLookup } from '@/lib/plan-nutrients'
import { OfflineQueue, type QueueStatus } from '@/lib/offline-queue'

// GitHub issue #25 / Prompt 5.3 — plan editörünün taslak durumu + otomatik
// kayıt. Zustand store, DB'deki PlanTree'yi (bkz. queries/plans.ts) düz
// (normalize edilmemiş, iç içe) bir taslak ağaca çevirir; her kullanıcı
// eylemi ÖNCE bu taslağı senkron günceller (anında UI geri bildirimi), SONRA
// ilgili server action'ı OfflineQueue üzerinden (debounce'lu veya immediate)
// tetikler. bkz. lib/offline-queue.ts dosya başı notu — "kusursuz bir senkron
// motoru DEĞİL, best-effort bir versiyon".

let idCounter = 0
function tempId(): string {
  idCounter += 1
  return `temp-${Date.now()}-${idCounter}`
}
function isTempId(id: string): boolean {
  return id.startsWith('temp-')
}

export interface DraftAlternative {
  id: string
  foodId: string | null
  recipeId: string | null
  freeText: string | null
  amountGrams: number
  note: string | null
}

export interface DraftItem {
  id: string
  mealId: string
  foodId: string | null
  recipeId: string | null
  freeText: string | null
  amountGrams: number
  note: string | null
  sortOrder: number
  isOptional: boolean
  alternatives: DraftAlternative[]
}

export interface DraftMeal {
  id: string
  dayId: string
  mealType: PlanMealType
  time: string | null
  name: string
  sortOrder: number
  items: DraftItem[]
}

export interface DraftDay {
  id: string
  dayNumber: number
  dayLabel: string | null
  meals: DraftMeal[]
}

function toDraftTree(tree: PlanTree): DraftDay[] {
  return tree.days.map((d) => ({
    id: d.day.id,
    dayNumber: d.day.dayNumber,
    dayLabel: d.day.dayLabel,
    meals: d.meals.map((m) => ({
      id: m.meal.id,
      dayId: d.day.id,
      mealType: m.meal.mealType,
      time: m.meal.time,
      name: m.meal.name,
      sortOrder: m.meal.sortOrder,
      items: m.items
        .map(({ item, alternatives }) => ({
          id: item.id,
          mealId: item.mealId,
          foodId: item.foodId,
          recipeId: item.recipeId,
          freeText: item.freeText,
          amountGrams: Number(item.amount),
          note: item.note,
          sortOrder: item.sortOrder,
          isOptional: item.isOptional,
          alternatives: alternatives
            .map((alt) => ({
              id: alt.id,
              foodId: alt.foodId,
              recipeId: alt.recipeId,
              freeText: alt.freeText,
              amountGrams: Number(alt.amount),
              note: null,
            }))
            .sort((a, b) => a.amountGrams - b.amountGrams),
        }))
        .sort((a, b) => a.sortOrder - b.sortOrder),
    })),
  }))
}

interface PlanEditorState {
  planId: string
  planName: string
  startDate: Date | null
  endDate: Date | null
  targetKcal: number | null
  days: DraftDay[]
  foodMacros: Record<string, FoodMacroLookup>
  saveStatus: QueueStatus
  pendingCount: number

  initialize: (input: {
    planId: string
    planName: string
    startDate: Date | null
    endDate: Date | null
    targetKcal: number | null
    tree: PlanTree
  }) => void
  resolveFoodMacros: () => Promise<void>

  setPlanMeta: (patch: {
    name?: string
    targetKcal?: number | null
    startDate?: Date | null
    endDate?: Date | null
  }) => void
  setMealMeta: (mealId: string, patch: { name?: string; time?: string | null }) => void

  addItemFromSelection: (mealId: string, selection: FoodSearchSelection) => void
  updateItemAmount: (itemId: string, amountGrams: number) => void
  updateItemNote: (itemId: string, note: string | null) => void
  removeItemById: (itemId: string) => void
  reorderMealItems: (mealId: string, orderedItemIds: string[]) => void
  moveItemToMeal: (itemId: string, fromMealId: string, toMealId: string, toIndex: number) => void

  addAlternativeFromSelection: (itemId: string, selection: FoodSearchSelection) => void
  removeAlternativeById: (alternativeId: string) => void

  notifyOnline: () => Promise<void>
  setOffline: () => void
}

const offlineQueue = new OfflineQueue({
  debounceMs: 800,
  onStatusChange: (status, pendingCount) => {
    usePlanEditorStore.setState({ saveStatus: status, pendingCount })
  },
})

function findMeal(days: DraftDay[], mealId: string): DraftMeal | undefined {
  for (const day of days) {
    const meal = day.meals.find((m) => m.id === mealId)
    if (meal) return meal
  }
  return undefined
}

function findItem(
  days: DraftDay[],
  itemId: string,
): { meal: DraftMeal; item: DraftItem } | undefined {
  for (const day of days) {
    for (const meal of day.meals) {
      const item = meal.items.find((i) => i.id === itemId)
      if (item) return { meal, item }
    }
  }
  return undefined
}

export const usePlanEditorStore = create<PlanEditorState>((set, get) => ({
  planId: '',
  planName: '',
  startDate: null,
  endDate: null,
  targetKcal: null,
  days: [],
  foodMacros: {},
  saveStatus: 'idle',
  pendingCount: 0,

  initialize: ({ planId, planName, startDate, endDate, targetKcal, tree }) => {
    set({ planId, planName, startDate, endDate, targetKcal, days: toDraftTree(tree) })
    void get().resolveFoodMacros()
  },

  // Var olan kalemlerin (sayfa ilk yüklendiğinde) ad/kcal/makro bilgisi
  // DB'nin PlanTree'sinde YOK (sadece foodId var) — Dexie'deki offline besin
  // indeksinden (bkz. lib/food-index.ts, #24) AĞA ÇIKMADAN okunur. Yeni
  // eklenen kalemler için bu zaten FoodSearchSelection ile birlikte gelir
  // (bkz. addItemFromSelection), burada sadece İLK YÜKLEME için eksik
  // olanlar tamamlanıyor.
  resolveFoodMacros: async () => {
    const { days, foodMacros } = get()
    const allFoodIds = new Set<string>()
    for (const day of days) {
      for (const meal of day.meals) {
        for (const item of meal.items) {
          if (item.foodId) allFoodIds.add(item.foodId)
          for (const alt of item.alternatives) {
            if (alt.foodId) allFoodIds.add(alt.foodId)
          }
        }
      }
    }
    const missing = [...allFoodIds].filter((id) => !foodMacros[id])
    if (missing.length === 0) return
    const rows = await getFoodIndexEntriesByIds(missing)
    const patch: Record<string, FoodMacroLookup> = {}
    for (const [id, row] of rows) {
      patch[id] = {
        id: row.id,
        nameTr: row.nameTr,
        kcalPer100g: row.kcalPer100g,
        proteinPer100g: row.proteinPer100g,
        carbPer100g: row.carbPer100g,
        fatPer100g: row.fatPer100g,
      }
    }
    set((state) => ({ foodMacros: { ...state.foodMacros, ...patch } }))
  },

  setPlanMeta: (patch) => {
    set((state) => ({
      planName: patch.name ?? state.planName,
      targetKcal: patch.targetKcal !== undefined ? patch.targetKcal : state.targetKcal,
      startDate: patch.startDate !== undefined ? patch.startDate : state.startDate,
      endDate: patch.endDate !== undefined ? patch.endDate : state.endDate,
    }))
    const { planId, planName, targetKcal, startDate, endDate } = get()
    offlineQueue.enqueue({
      key: 'plan:meta',
      run: async () => {
        const result = await updatePlanAction(planId, {
          name: planName,
          targetKcal,
          startDate,
          endDate,
        })
        if (!result.success) throw new Error(result.error ?? 'Plan güncellenemedi.')
      },
    })
  },

  setMealMeta: (mealId, patch) => {
    set((state) => ({
      days: state.days.map((day) => ({
        ...day,
        meals: day.meals.map((meal) =>
          meal.id === mealId
            ? {
                ...meal,
                name: patch.name ?? meal.name,
                time: patch.time !== undefined ? patch.time : meal.time,
              }
            : meal,
        ),
      })),
    }))
    const meal = findMeal(get().days, mealId)
    if (!meal) return
    offlineQueue.enqueue({
      key: `meal:${mealId}`,
      run: async () => {
        const result = await updateMealAction(mealId, { name: meal.name, time: meal.time })
        if (!result.success) throw new Error(result.error ?? 'Öğün güncellenemedi.')
      },
    })
  },

  addItemFromSelection: (mealId, selection) => {
    const { grams, noteHint } = resolveGramsFromSelection(selection)
    const draftId = tempId()
    const newItem: DraftItem = {
      id: draftId,
      mealId,
      foodId: selection.foodId,
      recipeId: null,
      freeText: null,
      amountGrams: grams,
      note: noteHint,
      sortOrder: 0,
      isOptional: false,
      alternatives: [],
    }

    set((state) => ({
      days: state.days.map((day) => ({
        ...day,
        meals: day.meals.map((meal) =>
          meal.id === mealId
            ? { ...meal, items: [...meal.items, { ...newItem, sortOrder: meal.items.length }] }
            : meal,
        ),
      })),
      foodMacros: {
        ...state.foodMacros,
        [selection.foodId]: {
          id: selection.foodId,
          nameTr: selection.nameTr,
          kcalPer100g: selection.kcalPer100g,
          proteinPer100g: selection.proteinPer100g,
          carbPer100g: selection.carbPer100g,
          fatPer100g: selection.fatPer100g,
        },
      },
    }))

    offlineQueue.enqueue(
      {
        key: `add-item:${draftId}`,
        run: async () => {
          const result = await addItemAction(mealId, {
            foodId: selection.foodId,
            amount: grams,
            note: noteHint,
          })
          if (!result.success || !result.data) throw new Error(result.error ?? 'Kalem eklenemedi.')
          const realId = result.data.id
          set((state) => ({
            days: state.days.map((day) => ({
              ...day,
              meals: day.meals.map((meal) => ({
                ...meal,
                items: meal.items.map((item) =>
                  item.id === draftId ? { ...item, id: realId } : item,
                ),
              })),
            })),
          }))
        },
      },
      { immediate: true },
    )
  },

  updateItemAmount: (itemId, amountGrams) => {
    set((state) => ({
      days: state.days.map((day) => ({
        ...day,
        meals: day.meals.map((meal) => ({
          ...meal,
          items: meal.items.map((item) => (item.id === itemId ? { ...item, amountGrams } : item)),
        })),
      })),
    }))
    if (isTempId(itemId)) return // henüz sunucuda yok, addItemFromSelection'ın kendi flush'ı zaten güncel grams'ı gönderecek
    offlineQueue.enqueue({
      key: `item-amount:${itemId}`,
      run: async () => {
        const result = await updateItemAction(itemId, { amount: amountGrams })
        if (!result.success) throw new Error(result.error ?? 'Miktar güncellenemedi.')
      },
    })
  },

  updateItemNote: (itemId, note) => {
    set((state) => ({
      days: state.days.map((day) => ({
        ...day,
        meals: day.meals.map((meal) => ({
          ...meal,
          items: meal.items.map((item) => (item.id === itemId ? { ...item, note } : item)),
        })),
      })),
    }))
    if (isTempId(itemId)) return
    offlineQueue.enqueue({
      key: `item-note:${itemId}`,
      run: async () => {
        const result = await updateItemAction(itemId, { note })
        if (!result.success) throw new Error(result.error ?? 'Not güncellenemedi.')
      },
    })
  },

  removeItemById: (itemId) => {
    set((state) => ({
      days: state.days.map((day) => ({
        ...day,
        meals: day.meals.map((meal) => ({
          ...meal,
          items: meal.items.filter((item) => item.id !== itemId),
        })),
      })),
    }))
    if (isTempId(itemId)) return
    offlineQueue.enqueue(
      {
        key: `remove-item:${itemId}`,
        run: async () => {
          const result = await removeItemAction(itemId)
          if (!result.success) throw new Error(result.error ?? 'Kalem silinemedi.')
        },
      },
      { immediate: true },
    )
  },

  reorderMealItems: (mealId, orderedItemIds) => {
    set((state) => ({
      days: state.days.map((day) => ({
        ...day,
        meals: day.meals.map((meal) => {
          if (meal.id !== mealId) return meal
          const byId = new Map(meal.items.map((item) => [item.id, item]))
          const reordered = orderedItemIds
            .map((id, index) => {
              const item = byId.get(id)
              return item ? { ...item, sortOrder: index } : null
            })
            .filter((item): item is DraftItem => item !== null)
          return { ...meal, items: reordered }
        }),
      })),
    }))
    // Sunucuda henüz gerçek id'si olmayan (temp-) kalemler varsa reorder
    // çağrısı bunları GÖNDERMEZ — reorderItems yalnızca var olan id'lerle
    // çalışabilir, temp id'ler flush olduğunda zaten doğru sortOrder'la
    // (meal.items sırasına göre) sunucuya addItem ile gidiyor.
    const realIds = orderedItemIds.filter((id) => !isTempId(id))
    if (realIds.length === 0) return
    offlineQueue.enqueue(
      {
        key: `reorder:${mealId}`,
        run: async () => {
          const result = await reorderItemsAction({ mealId, orderedItemIds: realIds })
          if (!result.success) throw new Error(result.error ?? 'Sıralama kaydedilemedi.')
        },
      },
      { immediate: true },
    )
  },

  moveItemToMeal: (itemId, fromMealId, toMealId, toIndex) => {
    let targetOrderedIds: string[] = []
    let sourceOrderedIds: string[] = []

    set((state) => ({
      days: state.days.map((day) => ({
        ...day,
        meals: day.meals.map((meal) => {
          if (meal.id === fromMealId && meal.id !== toMealId) {
            return { ...meal, items: meal.items.filter((item) => item.id !== itemId) }
          }
          return meal
        }),
      })),
    }))

    set((state) => {
      const movedItem = findItem(state.days, itemId)?.item
      if (!movedItem) return state
      return {
        days: state.days.map((day) => ({
          ...day,
          meals: day.meals.map((meal) => {
            if (meal.id !== toMealId) return meal
            const withoutMoved = meal.items.filter((item) => item.id !== itemId)
            const next = [...withoutMoved]
            next.splice(Math.min(toIndex, next.length), 0, { ...movedItem, mealId: toMealId })
            return { ...meal, items: next.map((item, index) => ({ ...item, sortOrder: index })) }
          }),
        })),
      }
    })

    const finalState = get()
    const targetMeal = findMeal(finalState.days, toMealId)
    const sourceMeal = fromMealId !== toMealId ? findMeal(finalState.days, fromMealId) : undefined
    targetOrderedIds = (targetMeal?.items ?? [])
      .map((item) => item.id)
      .filter((id) => !isTempId(id))
    sourceOrderedIds = (sourceMeal?.items ?? [])
      .map((item) => item.id)
      .filter((id) => !isTempId(id))

    if (isTempId(itemId)) return // henüz sunucuda yok — flush olunca zaten doğru öğüne eklenecek

    offlineQueue.enqueue(
      {
        key: `move-item:${itemId}`,
        run: async () => {
          const resolvedSortOrder = targetOrderedIds.indexOf(itemId)
          const moveResult = await moveItemAction({
            itemId,
            targetMealId: toMealId,
            sortOrder:
              resolvedSortOrder >= 0 ? resolvedSortOrder : Math.max(targetOrderedIds.length - 1, 0),
          })
          if (!moveResult.success) throw new Error(moveResult.error ?? 'Kalem taşınamadı.')

          if (targetOrderedIds.length > 0) {
            const reorderTarget = await reorderItemsAction({
              mealId: toMealId,
              orderedItemIds: targetOrderedIds,
            })
            if (!reorderTarget.success)
              throw new Error(reorderTarget.error ?? 'Sıralama kaydedilemedi.')
          }
          if (fromMealId !== toMealId && sourceOrderedIds.length > 0) {
            const reorderSource = await reorderItemsAction({
              mealId: fromMealId,
              orderedItemIds: sourceOrderedIds,
            })
            if (!reorderSource.success)
              throw new Error(reorderSource.error ?? 'Sıralama kaydedilemedi.')
          }
        },
      },
      { immediate: true },
    )
  },

  addAlternativeFromSelection: (itemId, selection) => {
    if (isTempId(itemId)) return // ana kalem henüz sunucuda yok, alternatif eklenemez (bkz. meal-block.tsx: buton bu sırada devre dışı)
    const { grams, noteHint } = resolveGramsFromSelection(selection)
    const draftId = tempId()
    const newAlt: DraftAlternative = {
      id: draftId,
      foodId: selection.foodId,
      recipeId: null,
      freeText: null,
      amountGrams: grams,
      note: noteHint,
    }

    set((state) => ({
      days: state.days.map((day) => ({
        ...day,
        meals: day.meals.map((meal) => ({
          ...meal,
          items: meal.items.map((item) =>
            item.id === itemId ? { ...item, alternatives: [...item.alternatives, newAlt] } : item,
          ),
        })),
      })),
      foodMacros: {
        ...state.foodMacros,
        [selection.foodId]: {
          id: selection.foodId,
          nameTr: selection.nameTr,
          kcalPer100g: selection.kcalPer100g,
          proteinPer100g: selection.proteinPer100g,
          carbPer100g: selection.carbPer100g,
          fatPer100g: selection.fatPer100g,
        },
      },
    }))

    offlineQueue.enqueue(
      {
        key: `add-alt:${draftId}`,
        run: async () => {
          const result = await addAlternativeAction(itemId, {
            foodId: selection.foodId,
            amount: grams,
          })
          if (!result.success || !result.data)
            throw new Error(result.error ?? 'Alternatif eklenemedi.')
          const realId = result.data.id
          set((state) => ({
            days: state.days.map((day) => ({
              ...day,
              meals: day.meals.map((meal) => ({
                ...meal,
                items: meal.items.map((item) => ({
                  ...item,
                  alternatives: item.alternatives.map((alt) =>
                    alt.id === draftId ? { ...alt, id: realId } : alt,
                  ),
                })),
              })),
            })),
          }))
        },
      },
      { immediate: true },
    )
  },

  removeAlternativeById: (alternativeId) => {
    set((state) => ({
      days: state.days.map((day) => ({
        ...day,
        meals: day.meals.map((meal) => ({
          ...meal,
          items: meal.items.map((item) => ({
            ...item,
            alternatives: item.alternatives.filter((alt) => alt.id !== alternativeId),
          })),
        })),
      })),
    }))
    if (isTempId(alternativeId)) return
    offlineQueue.enqueue(
      {
        key: `remove-alt:${alternativeId}`,
        run: async () => {
          const result = await removeAlternativeAction(alternativeId)
          if (!result.success) throw new Error(result.error ?? 'Alternatif silinemedi.')
        },
      },
      { immediate: true },
    )
  },

  notifyOnline: async () => {
    await offlineQueue.notifyOnline()
  },
  setOffline: () => {
    set({ saveStatus: 'offline' })
  },
}))

// Test/araç amaçlı: gerçek OfflineQueue örneğine erişim (offline-queue
// testleri bunu DEĞİL, sınıfı doğrudan test ediyor — bu export sadece
// plan-editor.tsx'in window 'online'/'offline' event'lerini bağlaması için).
export const planEditorOfflineQueue = offlineQueue

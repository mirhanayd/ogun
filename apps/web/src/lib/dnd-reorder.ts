// GitHub issue #25 / Prompt 5.3 — GÖREV 2: "Sürükle-bırak sıralama (dnd-kit),
// öğünler arası taşıma dahil". Bu dosya dnd-kit'in `onDragEnd` olayından
// GERÇEK reorderItems/moveItem payload'ını çıkaran SAF fonksiyonlar içerir
// — bileşenden (meal-block.tsx) AYRI tutulmasının tek sebebi test
// edilebilirlik: "dnd reorder → action çağrısı" eşlemesi tam bir DOM sürükle
// simülasyonu KURMADAN, düz girdi/çıktı olarak test edilebilsin (bkz.
// dnd-reorder.test.ts).
export function moveWithinArray<T>(items: readonly T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= items.length) return [...items]
  const clampedTo = Math.max(0, Math.min(toIndex, items.length - 1))
  const next = [...items]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(clampedTo, 0, moved as T)
  return next
}

export interface DragEndTarget {
  // Sürüklenen kalemin id'si.
  activeId: string
  // Bırakılan yerin id'si — ya başka bir kalemin id'si, ya da bir öğün
  // container'ının id'si (bkz. meal-block.tsx: `meal:${mealId}` formatı,
  // boş bir öğüne veya son kalemin altına bırakmak için).
  overId: string
}

export interface ReorderPlan {
  // Kalemin kalması/taşınması gereken öğün.
  targetMealId: string
  // O öğündeki YENİ tam sıralama (sunucuya reorderItemsAction'a gidecek id
  // listesi) — hedef öğün başka bir öğünse, kalem BU listeye zaten dahil
  // edilmiş olarak döner.
  targetOrderedIds: string[]
  // Kalem başka bir öğünden taşındıysa, KAYNAK öğünün kalan kalemleri (id'yle
  // kaldırılmış hâli) — aynı öğün içi sıralamada undefined.
  sourceMealId?: string
  sourceOrderedIds?: string[]
}

const MEAL_CONTAINER_PREFIX = 'meal:'

export function mealContainerId(mealId: string): string {
  return `${MEAL_CONTAINER_PREFIX}${mealId}`
}

// itemsByMeal: her öğünün MEVCUT (sürüklemeden önceki) kalem id sırası.
// itemMealOf: bir kalem id'sinin hangi öğüne ait olduğunu bulan harita.
export function computeDragEndPlan(
  target: DragEndTarget,
  itemsByMeal: Map<string, string[]>,
  itemMealOf: Map<string, string>,
): ReorderPlan | null {
  const sourceMealId = itemMealOf.get(target.activeId)
  if (!sourceMealId) return null

  let targetMealId: string
  let overItemId: string | null = null
  if (target.overId.startsWith(MEAL_CONTAINER_PREFIX)) {
    targetMealId = target.overId.slice(MEAL_CONTAINER_PREFIX.length)
  } else {
    const overMeal = itemMealOf.get(target.overId)
    if (!overMeal) return null
    targetMealId = overMeal
    overItemId = target.overId
  }

  if (sourceMealId === targetMealId) {
    const ids = itemsByMeal.get(sourceMealId) ?? []
    const fromIndex = ids.indexOf(target.activeId)
    const toIndex = overItemId ? ids.indexOf(overItemId) : ids.length - 1
    if (fromIndex === -1 || toIndex === -1) return null
    return {
      targetMealId: sourceMealId,
      targetOrderedIds: moveWithinArray(ids, fromIndex, toIndex),
    }
  }

  const sourceIds = (itemsByMeal.get(sourceMealId) ?? []).filter((id) => id !== target.activeId)
  const targetIdsWithoutActive = (itemsByMeal.get(targetMealId) ?? []).filter(
    (id) => id !== target.activeId,
  )
  const insertAt = overItemId
    ? targetIdsWithoutActive.indexOf(overItemId)
    : targetIdsWithoutActive.length
  const targetIds = [...targetIdsWithoutActive]
  targetIds.splice(insertAt === -1 ? targetIds.length : insertAt, 0, target.activeId)

  return {
    targetMealId,
    targetOrderedIds: targetIds,
    sourceMealId,
    sourceOrderedIds: sourceIds,
  }
}

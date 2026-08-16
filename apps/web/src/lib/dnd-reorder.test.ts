import { describe, expect, it } from 'vitest'
import { computeDragEndPlan, mealContainerId, moveWithinArray } from './dnd-reorder'

// GitHub issue #25 / Prompt 5.3 — "dnd reorder → reorderItems/moveItem
// payload eşlemesi" testleri. Gerçek bir DOM sürükle-bırak simülasyonu
// KURULMUYOR (dnd-kit'in kendi testleri bunu zaten kapsıyor) — burada test
// edilen şey, meal-block.tsx'in onDragEnd'inin ÜRETTİĞİ payload'ın (hangi
// action'a hangi id listesiyle gidileceği) doğru hesaplanması.
describe('moveWithinArray', () => {
  it('bir öğeyi ileri taşır', () => {
    expect(moveWithinArray(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
  })
  it('bir öğeyi geri taşır', () => {
    expect(moveWithinArray(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c'])
  })
  it('aynı index ise değişiklik yapmaz', () => {
    expect(moveWithinArray(['a', 'b'], 1, 1)).toEqual(['a', 'b'])
  })
})

describe('computeDragEndPlan — aynı öğün içi sıralama', () => {
  it('reorderItems için doğru sırayı üretir', () => {
    const itemsByMeal = new Map([['meal-1', ['i1', 'i2', 'i3']]])
    const itemMealOf = new Map([
      ['i1', 'meal-1'],
      ['i2', 'meal-1'],
      ['i3', 'meal-1'],
    ])

    const plan = computeDragEndPlan({ activeId: 'i1', overId: 'i3' }, itemsByMeal, itemMealOf)

    expect(plan).toEqual({ targetMealId: 'meal-1', targetOrderedIds: ['i2', 'i3', 'i1'] })
  })

  it("boş bir öğün container'ına bırakılırsa listenin sonuna gider", () => {
    const itemsByMeal = new Map([['meal-1', ['i1']]])
    const itemMealOf = new Map([['i1', 'meal-1']])

    const plan = computeDragEndPlan(
      { activeId: 'i1', overId: mealContainerId('meal-1') },
      itemsByMeal,
      itemMealOf,
    )
    expect(plan?.targetMealId).toBe('meal-1')
  })
})

describe('computeDragEndPlan — öğünler arası taşıma', () => {
  it('moveItem + iki ayrı reorderItems için kaynak/hedef listelerini üretir', () => {
    const itemsByMeal = new Map([
      ['meal-a', ['i1', 'i2']],
      ['meal-b', ['i3']],
    ])
    const itemMealOf = new Map([
      ['i1', 'meal-a'],
      ['i2', 'meal-a'],
      ['i3', 'meal-b'],
    ])

    const plan = computeDragEndPlan({ activeId: 'i1', overId: 'i3' }, itemsByMeal, itemMealOf)

    expect(plan).toEqual({
      targetMealId: 'meal-b',
      targetOrderedIds: ['i1', 'i3'],
      sourceMealId: 'meal-a',
      sourceOrderedIds: ['i2'],
    })
  })

  it("boş bir hedef öğüne (container'a) taşırken doğru payload üretir", () => {
    const itemsByMeal = new Map([
      ['meal-a', ['i1']],
      ['meal-b', []],
    ])
    const itemMealOf = new Map([['i1', 'meal-a']])

    const plan = computeDragEndPlan(
      { activeId: 'i1', overId: mealContainerId('meal-b') },
      itemsByMeal,
      itemMealOf,
    )

    expect(plan).toEqual({
      targetMealId: 'meal-b',
      targetOrderedIds: ['i1'],
      sourceMealId: 'meal-a',
      sourceOrderedIds: [],
    })
  })

  it('bilinmeyen bir activeId için null döner', () => {
    const plan = computeDragEndPlan({ activeId: 'ghost', overId: 'i1' }, new Map(), new Map())
    expect(plan).toBeNull()
  })
})

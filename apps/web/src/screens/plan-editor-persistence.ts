/* eslint-disable @typescript-eslint/no-explicit-any */

export type PlanEditorAction = (...args: any[]) => Promise<any>

export type PlanEditorActionName =
  | 'addAlternativeAction'
  | 'addItemAction'
  | 'insertSavedMealAction'
  | 'moveItemAction'
  | 'removeAlternativeAction'
  | 'removeItemAction'
  | 'reorderItemsAction'
  | 'updateItemAction'
  | 'updateMealAction'
  | 'updatePlanAction'
  | 'createSavedMealAction'
  | 'buildExchangeEquivalentsPreviewAction'
  | 'listFoodsForExchangeGroupAction'
export type PlanEditorPersistence = Partial<Record<PlanEditorActionName, PlanEditorAction>>

let persistence: PlanEditorPersistence = {}

export function configurePlanEditorPersistence(next: PlanEditorPersistence) {
  persistence = next
}

export function invokePlanEditorAction(name: PlanEditorActionName, ...args: any[]) {
  const action = persistence[name]
  if (!action) {
    return Promise.resolve({ success: false, error: 'Bu işlem mevcut veri sağlayıcısında kullanılamıyor.' })
  }
  return action(...args)
}

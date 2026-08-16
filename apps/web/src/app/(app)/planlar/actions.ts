'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@ogun/db'
import {
  addAlternative,
  addDay,
  addItem,
  addMeal,
  clonePlan,
  createPlan,
  deletePlan,
  duplicatePlan,
  getPlanTree,
  listPlans,
  moveItem,
  removeAlternative,
  removeItem,
  reorderItems,
  saveAsTemplate,
  updateItem,
  updateMeal,
  updatePlan,
  type ListPlansInput,
} from '@ogun/db/queries'
import { withAuth } from '@/lib/authz'
import { withAudit } from '@/lib/audit'
import {
  dayInputSchema,
  firstZodMessage,
  mealInputSchema,
  mealUpdateSchema,
  moveItemSchema,
  planAlternativeInputSchema,
  planInputSchema,
  planItemInputSchema,
  planItemUpdateSchema,
  planUpdateSchema,
  reorderItemsSchema,
  type DayInputValues,
  type MealInputValues,
  type MealUpdateValues,
  type MoveItemValues,
  type PlanAlternativeInputValues,
  type PlanInputValues,
  type PlanItemInputValues,
  type PlanItemUpdateValues,
  type PlanUpdateValues,
  type ReorderItemsValues,
} from '@/lib/validation/plan-schemas'
import type { PlanTemplateCategory } from '@ogun/db/schema'

// GitHub issue #23 / Prompt 5.1 — plan şeması server action'ları.
//
// BAĞLAM: bu issue'da HENÜZ bir editör UI'ı YOK (bkz. app/(app)/planlar/
// page.tsx yer tutucusu) — bu dosyanın TEK çağırıcısı şu an
// apps/web/src/app/(app)/planlar/actions.test.ts (round-trip testleri).
// #25 gerçek editörü yazdığında bu action'ları doğrudan kullanacak; dönüş
// şekilleri (PlanActionResult<T>) o yüzden ŞİMDİDEN optimistic-update'e
// uygun ("başarı + veri" ya da "başarısızlık + mesaj") tasarlandı —
// danisanlar/actions.ts'teki ClientActionResult deseniyle AYNI felsefe,
// burada JENERİK: her action kendi DTO'sunu `data` alanında döner.
export interface PlanActionResult<T = undefined> {
  success: boolean
  error?: string
  data?: T
}

function ok<T>(data?: T): PlanActionResult<T> {
  return { success: true, data }
}

function fail<T>(error: string): PlanActionResult<T> {
  return { success: false, error }
}

async function runAction<T>(fn: () => Promise<T>): Promise<PlanActionResult<T>> {
  try {
    return ok(await fn())
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'İşlem tamamlanamadı.')
  }
}

// planlar sayfası şu an sadece bir yer tutucu (bkz. page.tsx) — revalidatePath
// yine de çağrılıyor, #25 editör sayfasını /planlar altına eklediğinde
// çalışan bir cache-invalidation zaten hazır olsun diye.
function revalidatePlans(planId?: string) {
  revalidatePath('/planlar')
  if (planId) revalidatePath(`/planlar/${planId}`)
}

// --- diet_plans: create / update / delete / duplicate / saveAsTemplate ------

const createPlanForClinic = withAuth(
  withAudit(
    {
      action: 'create',
      entityType: 'diet_plan',
      entityId: (_args: [PlanInputValues], result: { id: string } | undefined) =>
        result?.id ?? null,
    },
    async (ctx, input: PlanInputValues) =>
      createPlan(db, ctx.scope.clinicId, ctx.user.id, {
        clientId: input.clientId ?? null,
        name: input.name,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        targetKcal: input.targetKcal ?? null,
        targetMacros: input.targetMacros ?? null,
        planType: input.planType,
        status: input.status,
        isTemplate: input.isTemplate,
        templateCategory: input.templateCategory ?? null,
        notes: input.notes ?? null,
        generalInstructions: input.generalInstructions ?? null,
      }),
  ),
)

export async function createPlanAction(
  input: PlanInputValues,
): Promise<PlanActionResult<{ id: string }>> {
  const parsed = planInputSchema.safeParse(input)
  if (!parsed.success) return fail(firstZodMessage(parsed.error))

  const result = await runAction(() => createPlanForClinic(parsed.data))
  if (result.success) revalidatePlans()
  return result
}

const updatePlanForClinic = withAuth(
  withAudit(
    {
      action: 'update',
      entityType: 'diet_plan',
      entityId: ([planId]: [string, PlanUpdateValues]) => planId,
    },
    async (ctx, planId: string, input: PlanUpdateValues) =>
      updatePlan(db, ctx.scope.clinicId, planId, {
        ...(input.clientId !== undefined && { clientId: input.clientId }),
        ...(input.name !== undefined && { name: input.name }),
        ...(input.startDate !== undefined && { startDate: input.startDate }),
        ...(input.endDate !== undefined && { endDate: input.endDate }),
        ...(input.targetKcal !== undefined && { targetKcal: input.targetKcal }),
        ...(input.targetMacros !== undefined && { targetMacros: input.targetMacros }),
        ...(input.planType !== undefined && { planType: input.planType }),
        ...(input.status !== undefined && { status: input.status }),
        ...(input.isTemplate !== undefined && { isTemplate: input.isTemplate }),
        ...(input.templateCategory !== undefined && { templateCategory: input.templateCategory }),
        ...(input.notes !== undefined && { notes: input.notes }),
        ...(input.generalInstructions !== undefined && {
          generalInstructions: input.generalInstructions,
        }),
      }),
  ),
)

export async function updatePlanAction(
  planId: string,
  input: PlanUpdateValues,
): Promise<PlanActionResult<{ id: string }>> {
  const parsed = planUpdateSchema.safeParse(input)
  if (!parsed.success) return fail(firstZodMessage(parsed.error))

  const result = await runAction(async () => {
    const plan = await updatePlanForClinic(planId, parsed.data)
    if (!plan) throw new Error('Plan bulunamadı.')
    return { id: plan.id }
  })
  if (result.success) revalidatePlans(planId)
  return result
}

const deletePlanForClinic = withAuth(
  withAudit(
    { action: 'delete', entityType: 'diet_plan', entityId: ([planId]: [string]) => planId },
    async (ctx, planId: string) => deletePlan(db, ctx.scope.clinicId, planId),
  ),
  ['owner', 'dietitian'],
)

export async function deletePlanAction(planId: string): Promise<PlanActionResult<undefined>> {
  const result = await runAction<undefined>(async () => {
    await deletePlanForClinic(planId)
    return undefined
  })
  if (result.success) revalidatePlans()
  return result
}

// duplicatePlan: AYNI danışan (veya AYNI şablonsuzluk) için bir kopya —
// queries/plans.ts duplicatePlan'ın davranışı, bkz. o fonksiyonun üstündeki
// not.
const duplicatePlanForClinic = withAuth(
  withAudit(
    {
      action: 'create',
      entityType: 'diet_plan',
      entityId: (_args: [string], result: { id: string } | undefined) => result?.id ?? null,
      metadata: ([sourcePlanId]: [string]) => ({ operation: 'duplicate', sourcePlanId }),
    },
    async (ctx, sourcePlanId: string) =>
      duplicatePlan(db, ctx.scope.clinicId, ctx.user.id, sourcePlanId),
  ),
)

export async function duplicatePlanAction(
  sourcePlanId: string,
): Promise<PlanActionResult<{ id: string }>> {
  const result = await runAction(() => duplicatePlanForClinic(sourcePlanId))
  if (result.success) revalidatePlans()
  return result
}

const saveAsTemplateForClinic = withAuth(
  withAudit(
    {
      action: 'create',
      entityType: 'diet_plan',
      entityId: (
        _args: [string, PlanTemplateCategory, string | undefined],
        result: { id: string } | undefined,
      ) => result?.id ?? null,
      metadata: ([sourcePlanId, templateCategory]: [
        string,
        PlanTemplateCategory,
        string | undefined,
      ]) => ({
        operation: 'save-as-template',
        sourcePlanId,
        templateCategory,
      }),
    },
    async (
      ctx,
      sourcePlanId: string,
      templateCategory: PlanTemplateCategory,
      name: string | undefined,
    ) => saveAsTemplate(db, ctx.scope.clinicId, ctx.user.id, sourcePlanId, templateCategory, name),
  ),
)

export async function saveAsTemplateAction(
  sourcePlanId: string,
  templateCategory: PlanTemplateCategory,
  name?: string,
): Promise<PlanActionResult<{ id: string }>> {
  const result = await runAction(() =>
    saveAsTemplateForClinic(sourcePlanId, templateCategory, name),
  )
  if (result.success) revalidatePlans()
  return result
}

// --- plan_days / plan_meals — addItem'ın hedefleyeceği yapıyı kurmak için --
// Roadmap'in GÖREV 4 listesi bunları AYRI isim olarak vermez (sadece
// addItem/updateItem/removeItem/reorderItems/addAlternative sayılır), ama
// bir öğe eklemek için önce bir gün + öğün gerekiyor — bu iki action, o
// GÖREV 1 şemasının doğal bir sonucu olarak buraya eklendi.

const addDayForClinic = withAuth(
  withAudit(
    {
      action: 'create',
      entityType: 'plan_day',
      entityId: (_args: [string, DayInputValues], result: { id: string } | undefined) =>
        result?.id ?? null,
    },
    async (ctx, planId: string, input: DayInputValues) =>
      addDay(db, ctx.scope.clinicId, planId, {
        dayNumber: input.dayNumber,
        dayLabel: input.dayLabel ?? null,
        notes: input.notes ?? null,
      }),
  ),
)

export async function addDayAction(
  planId: string,
  input: DayInputValues,
): Promise<PlanActionResult<{ id: string }>> {
  const parsed = dayInputSchema.safeParse(input)
  if (!parsed.success) return fail(firstZodMessage(parsed.error))
  const result = await runAction(() => addDayForClinic(planId, parsed.data))
  if (result.success) revalidatePlans(planId)
  return result
}

const addMealForClinic = withAuth(
  withAudit(
    {
      action: 'create',
      entityType: 'plan_meal',
      entityId: (_args: [string, MealInputValues], result: { id: string } | undefined) =>
        result?.id ?? null,
    },
    async (ctx, dayId: string, input: MealInputValues) =>
      addMeal(db, ctx.scope.clinicId, dayId, {
        mealType: input.mealType,
        time: input.time || null,
        name: input.name,
        sortOrder: input.sortOrder,
        notes: input.notes ?? null,
      }),
  ),
)

export async function addMealAction(
  dayId: string,
  input: MealInputValues,
): Promise<PlanActionResult<{ id: string }>> {
  const parsed = mealInputSchema.safeParse(input)
  if (!parsed.success) return fail(firstZodMessage(parsed.error))
  const result = await runAction(() => addMealForClinic(dayId, parsed.data))
  return result
}

const updateMealForClinic = withAuth(
  withAudit(
    {
      action: 'update',
      entityType: 'plan_meal',
      entityId: ([mealId]: [string, MealUpdateValues]) => mealId,
    },
    async (ctx, mealId: string, input: MealUpdateValues) =>
      updateMeal(db, ctx.scope.clinicId, mealId, {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.time !== undefined && { time: input.time || null }),
        ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
        ...(input.notes !== undefined && { notes: input.notes }),
      }),
  ),
)

export async function updateMealAction(
  mealId: string,
  input: MealUpdateValues,
): Promise<PlanActionResult<{ id: string }>> {
  const parsed = mealUpdateSchema.safeParse(input)
  if (!parsed.success) return fail(firstZodMessage(parsed.error))

  return runAction(async () => {
    const meal = await updateMealForClinic(mealId, parsed.data)
    if (!meal) throw new Error('Öğün bulunamadı.')
    return { id: meal.id }
  })
}

// --- plan_items --------------------------------------------------------------

const addItemForClinic = withAuth(
  withAudit(
    {
      action: 'create',
      entityType: 'plan_item',
      entityId: (_args: [string, PlanItemInputValues], result: { id: string } | undefined) =>
        result?.id ?? null,
    },
    async (ctx, mealId: string, input: PlanItemInputValues) =>
      addItem(db, ctx.scope.clinicId, mealId, {
        foodId: input.foodId ?? null,
        recipeId: input.recipeId ?? null,
        freeText: input.freeText ?? null,
        amount: input.amount,
        portionId: input.portionId ?? null,
        sortOrder: input.sortOrder,
        isOptional: input.isOptional,
        note: input.note ?? null,
      }),
  ),
)

export async function addItemAction(
  mealId: string,
  input: PlanItemInputValues,
): Promise<PlanActionResult<{ id: string }>> {
  const parsed = planItemInputSchema.safeParse(input)
  if (!parsed.success) return fail(firstZodMessage(parsed.error))
  const result = await runAction(() => addItemForClinic(mealId, parsed.data))
  return result
}

const updateItemForClinic = withAuth(
  withAudit(
    {
      action: 'update',
      entityType: 'plan_item',
      entityId: ([itemId]: [string, PlanItemUpdateValues]) => itemId,
    },
    async (ctx, itemId: string, input: PlanItemUpdateValues) =>
      updateItem(db, ctx.scope.clinicId, itemId, {
        ...(input.foodId !== undefined && { foodId: input.foodId }),
        ...(input.recipeId !== undefined && { recipeId: input.recipeId }),
        ...(input.freeText !== undefined && { freeText: input.freeText }),
        ...(input.amount !== undefined && { amount: input.amount }),
        ...(input.portionId !== undefined && { portionId: input.portionId }),
        ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
        ...(input.isOptional !== undefined && { isOptional: input.isOptional }),
        ...(input.note !== undefined && { note: input.note }),
      }),
  ),
)

export async function updateItemAction(
  itemId: string,
  input: PlanItemUpdateValues,
): Promise<PlanActionResult<{ id: string }>> {
  const parsed = planItemUpdateSchema.safeParse(input)
  if (!parsed.success) return fail(firstZodMessage(parsed.error))

  return runAction(async () => {
    const item = await updateItemForClinic(itemId, parsed.data)
    if (!item) throw new Error('Plan kalemi bulunamadı.')
    return { id: item.id }
  })
}

const removeItemForClinic = withAuth(
  withAudit(
    { action: 'delete', entityType: 'plan_item', entityId: ([itemId]: [string]) => itemId },
    async (ctx, itemId: string) => removeItem(db, ctx.scope.clinicId, itemId),
  ),
)

export async function removeItemAction(itemId: string): Promise<PlanActionResult<undefined>> {
  return runAction<undefined>(async () => {
    const removed = await removeItemForClinic(itemId)
    if (!removed) throw new Error('Plan kalemi bulunamadı.')
    return undefined
  })
}

const reorderItemsForClinic = withAuth(
  withAudit(
    {
      action: 'update',
      entityType: 'plan_item',
      metadata: ([input]: [ReorderItemsValues]) => ({
        operation: 'reorder',
        mealId: input.mealId,
        orderedItemIds: input.orderedItemIds,
      }),
    },
    async (ctx, input: ReorderItemsValues) =>
      reorderItems(db, ctx.scope.clinicId, input.mealId, input.orderedItemIds),
  ),
)

export async function reorderItemsAction(
  input: ReorderItemsValues,
): Promise<PlanActionResult<{ id: string; sortOrder: number }[]>> {
  const parsed = reorderItemsSchema.safeParse(input)
  if (!parsed.success) return fail(firstZodMessage(parsed.error))

  return runAction(async () => {
    const items = await reorderItemsForClinic(parsed.data)
    return items.map((item) => ({ id: item.id, sortOrder: item.sortOrder }))
  })
}

// GitHub issue #25 — bkz. queries/plans.ts moveItem üstündeki not. dnd-kit
// bir kalemi başka bir öğün bloğuna bıraktığında editör önce bunu, sonra
// (sortOrder'ı normalize etmek için) her iki öğün için reorderItemsAction'ı
// çağırır — bkz. plan-editor-store.ts moveItemBetweenMeals.
const moveItemForClinic = withAuth(
  withAudit(
    {
      action: 'update',
      entityType: 'plan_item',
      metadata: ([input]: [MoveItemValues]) => ({
        operation: 'move',
        itemId: input.itemId,
        targetMealId: input.targetMealId,
      }),
    },
    async (ctx, input: MoveItemValues) =>
      moveItem(db, ctx.scope.clinicId, input.itemId, input.targetMealId, input.sortOrder),
  ),
)

export async function moveItemAction(
  input: MoveItemValues,
): Promise<PlanActionResult<{ id: string }>> {
  const parsed = moveItemSchema.safeParse(input)
  if (!parsed.success) return fail(firstZodMessage(parsed.error))

  return runAction(async () => {
    const item = await moveItemForClinic(parsed.data)
    if (!item) throw new Error('Plan kalemi taşınamadı.')
    return { id: item.id }
  })
}

// --- plan_item_alternatives ---------------------------------------------------

const addAlternativeForClinic = withAuth(
  withAudit(
    {
      action: 'create',
      entityType: 'plan_item_alternative',
      entityId: (_args: [string, PlanAlternativeInputValues], result: { id: string } | undefined) =>
        result?.id ?? null,
    },
    async (ctx, itemId: string, input: PlanAlternativeInputValues) =>
      addAlternative(db, ctx.scope.clinicId, itemId, {
        foodId: input.foodId ?? null,
        recipeId: input.recipeId ?? null,
        freeText: input.freeText ?? null,
        amount: input.amount,
        portionId: input.portionId ?? null,
        sortOrder: input.sortOrder,
      }),
  ),
)

export async function addAlternativeAction(
  itemId: string,
  input: PlanAlternativeInputValues,
): Promise<PlanActionResult<{ id: string }>> {
  const parsed = planAlternativeInputSchema.safeParse(input)
  if (!parsed.success) return fail(firstZodMessage(parsed.error))
  return runAction(() => addAlternativeForClinic(itemId, parsed.data))
}

const removeAlternativeForClinic = withAuth(
  withAudit(
    {
      action: 'delete',
      entityType: 'plan_item_alternative',
      entityId: ([alternativeId]: [string]) => alternativeId,
    },
    async (ctx, alternativeId: string) => removeAlternative(db, ctx.scope.clinicId, alternativeId),
  ),
)

export async function removeAlternativeAction(
  alternativeId: string,
): Promise<PlanActionResult<undefined>> {
  return runAction<undefined>(async () => {
    const removed = await removeAlternativeForClinic(alternativeId)
    if (!removed) throw new Error('Alternatif bulunamadı.')
    return undefined
  })
}

// --- okuma ---------------------------------------------------------------

// Danışan detay sayfasının "Planlar" sekmesi (#25) için — bir danışanın
// (veya şablonların) plan listesini döner. computedTotals'ı YENİDEN
// HESAPLAMADAN doğrudan okur (bkz. queries/plans.ts listPlans üstündeki not).
const listPlansForClinic = withAuth(
  withAudit({ action: 'read', entityType: 'diet_plan' }, async (ctx, filter: ListPlansInput) =>
    listPlans(db, ctx.scope.clinicId, filter),
  ),
)

export async function listPlansAction(
  filter: ListPlansInput = {},
): Promise<PlanActionResult<Awaited<ReturnType<typeof listPlans>>>> {
  return runAction(() => listPlansForClinic(filter))
}

// Editör UI'ının (#25) ilk yüklemesi için — read işlemi de withAudit'ten
// geçer (bkz. audit.ts dosya başı notu: "okuma senaryosunda da AYNI wrapper
// kullanılır").
const getPlanTreeForClinic = withAuth(
  withAudit(
    { action: 'read', entityType: 'diet_plan', entityId: ([planId]: [string]) => planId },
    async (ctx, planId: string) => getPlanTree(db, ctx.scope.clinicId, planId),
  ),
)

export async function getPlanTreeAction(
  planId: string,
): Promise<PlanActionResult<Awaited<ReturnType<typeof getPlanTree>>>> {
  return runAction(() => getPlanTreeForClinic(planId))
}

// #25/#26 için hazır bekleyen klonlama girişi — clonePlan'ın kendisi
// duplicatePlanAction/saveAsTemplateAction'ın DEĞİL, targetClientId'yi
// SERBESTÇE seçebilen genel amaçlı bir action (ör. "bu şablonu şu danışana
// uygula" akışı).
const clonePlanForClinic = withAuth(
  withAudit(
    {
      action: 'create',
      entityType: 'diet_plan',
      entityId: (_args: [string, string | null], result: { id: string } | undefined) =>
        result?.id ?? null,
      metadata: ([sourcePlanId, targetClientId]: [string, string | null]) => ({
        operation: 'clone',
        sourcePlanId,
        targetClientId,
      }),
    },
    async (ctx, sourcePlanId: string, targetClientId: string | null) =>
      clonePlan(db, ctx.scope.clinicId, ctx.user.id, sourcePlanId, targetClientId),
  ),
)

export async function clonePlanAction(
  sourcePlanId: string,
  targetClientId: string | null,
): Promise<PlanActionResult<{ id: string }>> {
  const result = await runAction(() => clonePlanForClinic(sourcePlanId, targetClientId))
  if (result.success) revalidatePlans()
  return result
}

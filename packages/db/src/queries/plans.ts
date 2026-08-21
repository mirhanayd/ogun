import { and, asc, eq, exists, inArray, isNull, or, sql } from 'drizzle-orm'
import {
  dietPlans,
  planDays,
  planItemAlternatives,
  planItems,
  planMeals,
  type ComputedPlanTotals,
  type PlanMealType,
  type PlanOutputFormat,
  type PlanStatus,
  type PlanTemplateCategory,
  type PlanType,
} from '../schema/plans'
import { planShares, planShareSends } from '../schema/plan-shares'
import { clients } from '../schema/clients'
import type { Database } from '../client'

async function assertPlanClientInClinic(db: Database, clinicId: string, clientId: string): Promise<void> {
  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.clinicId, clinicId)))
    .limit(1)
  if (!client) throw new Error('Danışan bulunamadı veya bu kliniğe ait değil.')
}

// GitHub issue #23 / Prompt 5.1 — plan şeması sorgu katmanı. Bu dosya
// packages/db/src/queries/measurements.ts / clients.ts'teki AYNI desenle
// yazıldı: fonksiyonlar düz bir `clinicId: string` alır (ClinicScope markalı
// tipi apps/web tarafında zorlanır, bkz. authz.ts), ve HER yazma/okuma
// diet_plans.clinicId üzerinden filtrelenir. plan_days/plan_meals/plan_items/
// plan_item_alternatives'ın kendi clinicId sütunu YOK — issue'nun kendi
// talimatı gereği (bkz. görev metni: "plan_days/plan_meals/plan_items/
// plan_item_alternatives parent plan üzerinden indirekt scope eder", ve
// health-records.ts'teki lab_results/documents ile AYNI indirekt-join
// deseni) bu tablolar planId -> dietPlans.clinicId zincirinden doğrulanır.

// --- Ortak yardımcılar ---------------------------------------------------

async function assertPlanInClinic(db: Database, clinicId: string, planId: string): Promise<void> {
  const [plan] = await db
    .select({ id: dietPlans.id })
    .from(dietPlans)
    .where(and(eq(dietPlans.id, planId), eq(dietPlans.clinicId, clinicId)))
    .limit(1)
  if (!plan) {
    throw new Error('Plan bulunamadı.')
  }
}

// Bir günün, verilen klinikteki bir plana GERÇEKTEN ait olduğunu doğrular —
// assertPlanInClinic ile AYNI "önce doğrula, sonra yaz" deseni, bir seviye
// daha derinde (day -> plan -> clinic).
async function getDayWithClinicCheck(db: Database, clinicId: string, dayId: string) {
  const [row] = await db
    .select({ day: planDays, plan: dietPlans })
    .from(planDays)
    .innerJoin(dietPlans, eq(dietPlans.id, planDays.planId))
    .where(and(eq(planDays.id, dayId), eq(dietPlans.clinicId, clinicId)))
    .limit(1)
  return row ?? null
}

async function getMealWithClinicCheck(db: Database, clinicId: string, mealId: string) {
  const [row] = await db
    .select({ meal: planMeals, day: planDays, plan: dietPlans })
    .from(planMeals)
    .innerJoin(planDays, eq(planDays.id, planMeals.dayId))
    .innerJoin(dietPlans, eq(dietPlans.id, planDays.planId))
    .where(and(eq(planMeals.id, mealId), eq(dietPlans.clinicId, clinicId)))
    .limit(1)
  return row ?? null
}

async function getItemWithClinicCheck(db: Database, clinicId: string, itemId: string) {
  const [row] = await db
    .select({ item: planItems, meal: planMeals, day: planDays, plan: dietPlans })
    .from(planItems)
    .innerJoin(planMeals, eq(planMeals.id, planItems.mealId))
    .innerJoin(planDays, eq(planDays.id, planMeals.dayId))
    .innerJoin(dietPlans, eq(dietPlans.id, planDays.planId))
    .where(and(eq(planItems.id, itemId), eq(dietPlans.clinicId, clinicId)))
    .limit(1)
  return row ?? null
}

// --- diet_plans: create/update/delete/list -----------------------------------

export interface PlanInput {
  clientId?: string | null
  name: string
  startDate?: Date | null
  endDate?: Date | null
  targetKcal?: number | null
  targetMacros?: Record<string, number> | null
  planType?: PlanType
  status?: PlanStatus
  isTemplate?: boolean
  templateCategory?: PlanTemplateCategory | null
  notes?: string | null
  generalInstructions?: string | null
  // GitHub issue #28 / Prompt 5.6, GÖREV 4.
  outputFormat?: PlanOutputFormat
}

export async function createPlan(
  db: Database,
  clinicId: string,
  createdBy: string,
  input: PlanInput,
) {
  if (input.clientId) await assertPlanClientInClinic(db, clinicId, input.clientId)
  const [plan] = await db
    .insert(dietPlans)
    .values({
      clinicId,
      clientId: input.clientId ?? null,
      name: input.name,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      targetKcal: input.targetKcal ?? null,
      targetMacros: input.targetMacros ?? null,
      planType: input.planType ?? 'günlük',
      status: input.status ?? 'taslak',
      isTemplate: input.isTemplate ?? false,
      templateCategory: input.templateCategory ?? null,
      createdBy,
      notes: input.notes ?? null,
      generalInstructions: input.generalInstructions ?? null,
      ...(input.outputFormat !== undefined && { outputFormat: input.outputFormat }),
    })
    .returning()
  if (!plan) throw new Error('Plan oluşturulamadı.')
  return plan
}

export async function getPlanById(db: Database, clinicId: string, planId: string) {
  const [plan] = await db
    .select()
    .from(dietPlans)
    .where(and(eq(dietPlans.id, planId), eq(dietPlans.clinicId, clinicId)))
    .limit(1)
  return plan ?? null
}

export interface ListPlansInput {
  clientId?: string | null
  status?: PlanStatus
  isTemplate?: boolean
  templateCategory?: PlanTemplateCategory
  // Davetli diyetisyen görünürlüğü: klinik şablonları + yalnızca kendisine
  // atanmış danışanların planları. Owner çağrıları bu alanı göndermez.
  visibleToDietitianId?: string
}

// Liste ekranları computedTotals'ı YENİDEN HESAPLAMADAN doğrudan okur
// (GÖREV 2 kuralı) — bu yüzden select() burada de fazladan bir join/hesap
// içermez, önbelleklenmiş sütun zaten SELECT * ile geliyor.
export async function listPlans(db: Database, clinicId: string, filter: ListPlansInput = {}) {
  const conditions = [eq(dietPlans.clinicId, clinicId)]
  if (filter.clientId !== undefined) {
    conditions.push(
      filter.clientId === null
        ? isNull(dietPlans.clientId)
        : eq(dietPlans.clientId, filter.clientId),
    )
  }
  if (filter.status) conditions.push(eq(dietPlans.status, filter.status))
  if (filter.isTemplate !== undefined) conditions.push(eq(dietPlans.isTemplate, filter.isTemplate))
  if (filter.templateCategory)
    conditions.push(eq(dietPlans.templateCategory, filter.templateCategory))
  if (filter.visibleToDietitianId) {
    conditions.push(
      or(
        isNull(dietPlans.clientId),
        exists(
          db
            .select({ id: clients.id })
            .from(clients)
            .where(
              and(
                eq(clients.id, dietPlans.clientId),
                eq(clients.clinicId, clinicId),
                eq(clients.assignedDietitianId, filter.visibleToDietitianId),
              ),
            ),
        ),
      )!,
    )
  }

  return db
    .select()
    .from(dietPlans)
    .where(and(...conditions))
    .orderBy(asc(dietPlans.name))
}

export async function updatePlan(
  db: Database,
  clinicId: string,
  planId: string,
  input: Partial<PlanInput>,
) {
  if (input.clientId) await assertPlanClientInClinic(db, clinicId, input.clientId)
  const [plan] = await db
    .update(dietPlans)
    .set({
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
      ...(input.outputFormat !== undefined && { outputFormat: input.outputFormat }),
    })
    .where(and(eq(dietPlans.id, planId), eq(dietPlans.clinicId, clinicId)))
    .returning()
  return plan ?? null
}

// computedTotals önbelleğini yazar (GÖREV 2) — bu issue'da HİÇBİR ÇAĞIRICI
// tarafından tetiklenmiyor (nutrition-core çağrısı #25/#26'nın kapsamında),
// sadece sözleşme burada hazır bekliyor.
export async function updatePlanComputedTotals(
  db: Database,
  clinicId: string,
  planId: string,
  computedTotals: ComputedPlanTotals,
) {
  const [plan] = await db
    .update(dietPlans)
    .set({ computedTotals, computedAt: new Date() })
    .where(and(eq(dietPlans.id, planId), eq(dietPlans.clinicId, clinicId)))
    .returning()
  return plan ?? null
}

// Plan silme — DERİN bir cascade FK YOK (bkz. şema), bu yüzden çocuk
// kayıtlar (days -> meals -> items -> alternatives) burada elle, en
// derinden en sığa doğru siliniyor, tek bir transaction içinde.
export async function deletePlan(db: Database, clinicId: string, planId: string) {
  await assertPlanInClinic(db, clinicId, planId)

  return db.transaction(async (tx) => {
    // GitHub issue #36 / Prompt 6.2 — plan_shares.planId -> dietPlans.id FK'sı
    // CASCADE DEĞİL (şemadaki genel "cascade yok, elle sil" kuralı burada da
    // geçerli, bkz. üstteki not) — bir plan silinmeden ÖNCE paylaşım
    // linkleri/gönderim kayıtları da temizlenmeli, aksi halde FK kısıtı
    // silmeyi reddeder.
    const shares = await tx.select({ id: planShares.id }).from(planShares).where(eq(planShares.planId, planId))
    const shareIds = shares.map((s) => s.id)
    if (shareIds.length > 0) {
      await tx.delete(planShareSends).where(inArray(planShareSends.shareId, shareIds))
      await tx.delete(planShares).where(eq(planShares.planId, planId))
    }

    const days = await tx
      .select({ id: planDays.id })
      .from(planDays)
      .where(eq(planDays.planId, planId))
    const dayIds = days.map((d) => d.id)

    if (dayIds.length > 0) {
      const meals = await tx
        .select({ id: planMeals.id })
        .from(planMeals)
        .where(inArray(planMeals.dayId, dayIds))
      const mealIds = meals.map((m) => m.id)

      if (mealIds.length > 0) {
        const items = await tx
          .select({ id: planItems.id })
          .from(planItems)
          .where(inArray(planItems.mealId, mealIds))
        const itemIds = items.map((i) => i.id)

        if (itemIds.length > 0) {
          await tx.delete(planItemAlternatives).where(inArray(planItemAlternatives.itemId, itemIds))
        }
        await tx.delete(planItems).where(inArray(planItems.mealId, mealIds))
      }
      await tx.delete(planMeals).where(inArray(planMeals.dayId, dayIds))
    }
    await tx.delete(planDays).where(eq(planDays.planId, planId))
    const [deleted] = await tx.delete(dietPlans).where(eq(dietPlans.id, planId)).returning()
    return deleted ?? null
  })
}

// --- plan_days / plan_meals / plan_items — düzenleme yardımcıları -------------

export interface DayInput {
  dayNumber: number
  dayLabel?: string | null
  notes?: string | null
}

export async function addDay(db: Database, clinicId: string, planId: string, input: DayInput) {
  await assertPlanInClinic(db, clinicId, planId)
  const [day] = await db
    .insert(planDays)
    .values({
      planId,
      dayNumber: input.dayNumber,
      dayLabel: input.dayLabel ?? null,
      notes: input.notes ?? null,
    })
    .returning()
  if (!day) throw new Error('Gün eklenemedi.')
  return day
}

export interface MealInput {
  mealType: PlanMealType
  time?: string | null
  name: string
  sortOrder?: number
  notes?: string | null
}

export async function addMeal(db: Database, clinicId: string, dayId: string, input: MealInput) {
  const found = await getDayWithClinicCheck(db, clinicId, dayId)
  if (!found) throw new Error('Gün bulunamadı.')

  const [meal] = await db
    .insert(planMeals)
    .values({
      dayId,
      mealType: input.mealType,
      time: input.time ?? null,
      name: input.name,
      sortOrder: input.sortOrder ?? 0,
      notes: input.notes ?? null,
    })
    .returning()
  if (!meal) throw new Error('Öğün eklenemedi.')
  return meal
}

// GitHub issue #25 / Prompt 5.3 — GÖREV 2: "Başlık (düzenlenebilir) + saat".
// #23'ün action listesi (createPlan/updatePlan/deletePlan/duplicatePlan/
// saveAsTemplate/addItem/updateItem/removeItem/reorderItems/addAlternative)
// bir updateMeal BIRAKMAMIŞTI — addMeal vardı ama düzenleme yoktu. Bu, #25'in
// açıkça istediği "öğün başlığı satır içi düzenlenebilir" gereksinimi için
// eksik bir parça; addDay/addMeal/addItem/updateItem'la AYNI "önce clinic
// doğrula, sonra yaz" deseniyle burada TAMAMLANIYOR (raw sorguyla bypass
// DEĞİL, #23'ün kendi deseninin doğal bir devamı).
export interface MealUpdateInput {
  name?: string
  time?: string | null
  sortOrder?: number
  notes?: string | null
}

export async function updateMeal(
  db: Database,
  clinicId: string,
  mealId: string,
  input: MealUpdateInput,
) {
  const found = await getMealWithClinicCheck(db, clinicId, mealId)
  if (!found) throw new Error('Öğün bulunamadı.')

  const [meal] = await db
    .update(planMeals)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.time !== undefined && { time: input.time }),
      ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
      ...(input.notes !== undefined && { notes: input.notes }),
    })
    .where(eq(planMeals.id, mealId))
    .returning()
  return meal ?? null
}

// plan_items VE plan_item_alternatives için ortak girdi şekli — şema
// dosyasındaki "aynı alan şekli" notuyla birebir aynı, bkz. schema/plans.ts.
export interface PlanItemSourceInput {
  foodId?: string | null
  recipeId?: string | null
  freeText?: string | null
  amount: number
  portionId?: string | null
  sortOrder?: number
  isOptional?: boolean
  note?: string | null
}

// Uygulama katmanı doğrulaması — DB'deki CHECK kısıtının (bkz. schema/plans.ts
// exactlyOneItemSourceCheck) aynısı, ama sunucu tarafında ERKEN ve okunabilir
// bir hata mesajıyla. plan-schemas.ts'teki Zod .refine() de AYNI kuralı UI
// girişinde uygular — üç katman (Zod, burası, DB CHECK) kasıtlı olarak
// TEKRAR EDİYOR, çünkü her biri farklı bir bypass yolunu (form atlatma,
// doğrudan fonksiyon çağrısı, elle SQL) kapatıyor.
function assertExactlyOneSource(
  input: Pick<PlanItemSourceInput, 'foodId' | 'recipeId' | 'freeText'>,
): void {
  const filled = [input.foodId, input.recipeId, input.freeText].filter(
    (value) => value !== null && value !== undefined && value !== '',
  )
  if (filled.length !== 1) {
    throw new Error('Bir plan kalemi tam olarak bir besin, tarif veya serbest metin içermelidir.')
  }
}

export async function addItem(
  db: Database,
  clinicId: string,
  mealId: string,
  input: PlanItemSourceInput,
) {
  assertExactlyOneSource(input)
  const found = await getMealWithClinicCheck(db, clinicId, mealId)
  if (!found) throw new Error('Öğün bulunamadı.')

  const [item] = await db
    .insert(planItems)
    .values({
      mealId,
      foodId: input.foodId ?? null,
      recipeId: input.recipeId ?? null,
      freeText: input.freeText ?? null,
      amount: input.amount.toString(),
      portionId: input.portionId ?? null,
      sortOrder: input.sortOrder ?? 0,
      isOptional: input.isOptional ?? false,
      note: input.note ?? null,
    })
    .returning()
  if (!item) throw new Error('Plan kalemi eklenemedi.')
  return item
}

export async function updateItem(
  db: Database,
  clinicId: string,
  itemId: string,
  input: Partial<PlanItemSourceInput>,
) {
  const found = await getItemWithClinicCheck(db, clinicId, itemId)
  if (!found) throw new Error('Plan kalemi bulunamadı.')

  // Kaynak alanlarından herhangi biri değişiyorsa, güncel sonucun da
  // "tam olarak bir kaynak" kuralını sağladığını doğrula.
  if (input.foodId !== undefined || input.recipeId !== undefined || input.freeText !== undefined) {
    assertExactlyOneSource({
      foodId: input.foodId !== undefined ? input.foodId : found.item.foodId,
      recipeId: input.recipeId !== undefined ? input.recipeId : found.item.recipeId,
      freeText: input.freeText !== undefined ? input.freeText : found.item.freeText,
    })
  }

  const [item] = await db
    .update(planItems)
    .set({
      ...(input.foodId !== undefined && { foodId: input.foodId }),
      ...(input.recipeId !== undefined && { recipeId: input.recipeId }),
      ...(input.freeText !== undefined && { freeText: input.freeText }),
      ...(input.amount !== undefined && { amount: input.amount.toString() }),
      ...(input.portionId !== undefined && { portionId: input.portionId }),
      ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
      ...(input.isOptional !== undefined && { isOptional: input.isOptional }),
      ...(input.note !== undefined && { note: input.note }),
    })
    .where(eq(planItems.id, itemId))
    .returning()
  return item ?? null
}

export async function removeItem(db: Database, clinicId: string, itemId: string) {
  const found = await getItemWithClinicCheck(db, clinicId, itemId)
  if (!found) return null
  await db.delete(planItemAlternatives).where(eq(planItemAlternatives.itemId, itemId))
  const [deleted] = await db.delete(planItems).where(eq(planItems.id, itemId)).returning()
  return deleted ?? null
}

// Optimistic UI'nin (bkz. issue #25) sürükle-bırakla yeniden sıraladığı
// kalemleri TEK bir çağrıda kalıcı hale getirir. items sırayla sortOrder
// 0..n-1 alır.
export async function reorderItems(
  db: Database,
  clinicId: string,
  mealId: string,
  orderedItemIds: string[],
) {
  const found = await getMealWithClinicCheck(db, clinicId, mealId)
  if (!found) throw new Error('Öğün bulunamadı.')

  return db.transaction(async (tx) => {
    const updated = []
    for (let index = 0; index < orderedItemIds.length; index += 1) {
      const [item] = await tx
        .update(planItems)
        .set({ sortOrder: index })
        .where(and(eq(planItems.id, orderedItemIds[index]!), eq(planItems.mealId, mealId)))
        .returning()
      if (item) updated.push(item)
    }
    return updated
  })
}

// GitHub issue #25 / Prompt 5.3 — reorderItems (bkz. yukarısı) SADECE aynı
// öğün içindeki kalemlerin sortOrder'ını değiştirir (WHERE mealId = mealId
// koşuluyla), bu yüzden sürükle-bırakla bir kalemi BAŞKA bir öğüne taşımak
// için ayrı, dar kapsamlı bir fonksiyon gerekiyor. Öğün editörünün ("#23
// action'larını atlamadan genişlet" kuralı) doğal bir uzantısı: itemId'nin
// clinicId'ye ait olduğu ZATEN doğrulanır (getItemWithClinicCheck), hedef
// öğünün de AYNI klinikte olduğu ayrıca doğrulanır (getMealWithClinicCheck)
// — böylece bir kalem başka bir kliniğin öğününe "kaçırılamaz".
export async function moveItem(
  db: Database,
  clinicId: string,
  itemId: string,
  targetMealId: string,
  sortOrder: number,
) {
  const foundItem = await getItemWithClinicCheck(db, clinicId, itemId)
  if (!foundItem) throw new Error('Plan kalemi bulunamadı.')
  const foundMeal = await getMealWithClinicCheck(db, clinicId, targetMealId)
  if (!foundMeal) throw new Error('Hedef öğün bulunamadı.')

  const [item] = await db
    .update(planItems)
    .set({ mealId: targetMealId, sortOrder })
    .where(eq(planItems.id, itemId))
    .returning()
  return item ?? null
}

export async function addAlternative(
  db: Database,
  clinicId: string,
  itemId: string,
  input: PlanItemSourceInput,
) {
  assertExactlyOneSource(input)
  const found = await getItemWithClinicCheck(db, clinicId, itemId)
  if (!found) throw new Error('Plan kalemi bulunamadı.')

  const [alternative] = await db
    .insert(planItemAlternatives)
    .values({
      itemId,
      foodId: input.foodId ?? null,
      recipeId: input.recipeId ?? null,
      freeText: input.freeText ?? null,
      amount: input.amount.toString(),
      portionId: input.portionId ?? null,
      sortOrder: input.sortOrder ?? 0,
    })
    .returning()
  if (!alternative) throw new Error('Alternatif eklenemedi.')
  return alternative
}

export async function removeAlternative(db: Database, clinicId: string, alternativeId: string) {
  const [row] = await db
    .select({
      alt: planItemAlternatives,
      item: planItems,
      meal: planMeals,
      day: planDays,
      plan: dietPlans,
    })
    .from(planItemAlternatives)
    .innerJoin(planItems, eq(planItems.id, planItemAlternatives.itemId))
    .innerJoin(planMeals, eq(planMeals.id, planItems.mealId))
    .innerJoin(planDays, eq(planDays.id, planMeals.dayId))
    .innerJoin(dietPlans, eq(dietPlans.id, planDays.planId))
    .where(and(eq(planItemAlternatives.id, alternativeId), eq(dietPlans.clinicId, clinicId)))
    .limit(1)
  if (!row) return null
  const [deleted] = await db
    .delete(planItemAlternatives)
    .where(eq(planItemAlternatives.id, alternativeId))
    .returning()
  return deleted ?? null
}

// --- Tam plan ağacını okuma (editör/klonlama için) ---------------------------

export interface PlanTree {
  plan: typeof dietPlans.$inferSelect
  days: Array<{
    day: typeof planDays.$inferSelect
    meals: Array<{
      meal: typeof planMeals.$inferSelect
      items: Array<{
        item: typeof planItems.$inferSelect
        alternatives: (typeof planItemAlternatives.$inferSelect)[]
      }>
    }>
  }>
}

// Bir planın TÜM ağacını (gün -> öğün -> kalem -> alternatif) tek bir
// nesnede döner — hem gelecekteki editör UI'ının (#25) ilk yüklemesi hem de
// clonePlan'ın kaynak veri okuması bunu kullanabilir.
export async function getPlanTree(
  db: Database,
  clinicId: string,
  planId: string,
): Promise<PlanTree | null> {
  const plan = await getPlanById(db, clinicId, planId)
  if (!plan) return null

  const days = await db
    .select()
    .from(planDays)
    .where(eq(planDays.planId, planId))
    .orderBy(asc(planDays.dayNumber))
  const dayIds = days.map((d) => d.id)

  const meals = dayIds.length
    ? await db
        .select()
        .from(planMeals)
        .where(inArray(planMeals.dayId, dayIds))
        .orderBy(asc(planMeals.sortOrder))
    : []
  const mealIds = meals.map((m) => m.id)

  const items = mealIds.length
    ? await db
        .select()
        .from(planItems)
        .where(inArray(planItems.mealId, mealIds))
        .orderBy(asc(planItems.sortOrder))
    : []
  const itemIds = items.map((i) => i.id)

  const alternatives = itemIds.length
    ? await db
        .select()
        .from(planItemAlternatives)
        .where(inArray(planItemAlternatives.itemId, itemIds))
        .orderBy(asc(planItemAlternatives.sortOrder))
    : []

  return {
    plan,
    days: days.map((day) => ({
      day,
      meals: meals
        .filter((meal) => meal.dayId === day.id)
        .map((meal) => ({
          meal,
          items: items
            .filter((item) => item.mealId === meal.id)
            .map((item) => ({
              item,
              alternatives: alternatives.filter((alt) => alt.itemId === item.id),
            })),
        })),
    })),
  }
}

// --- GÖREV 3: şablon sistemi ---------------------------------------------------

export async function saveAsTemplate(
  db: Database,
  clinicId: string,
  createdBy: string,
  sourcePlanId: string,
  templateCategory: PlanTemplateCategory,
  name?: string,
) {
  return clonePlanInternal(db, clinicId, createdBy, sourcePlanId, {
    clientId: null,
    isTemplate: true,
    templateCategory,
    status: 'taslak',
    name,
  })
}

// Roadmap GÖREV 3: "clonePlan(sourceId, targetClientId) fonksiyonu — derin
// kopya". targetClientId verilmezse (undefined) kaynağın clientId'si
// korunur (aynı danışan için "kopyala" senaryosu); null verilirse plan bir
// şablona/klientsiz kopyaya dönüşür (bkz. saveAsTemplate).
export async function clonePlan(
  db: Database,
  clinicId: string,
  createdBy: string,
  sourcePlanId: string,
  targetClientId?: string | null,
) {
  return clonePlanInternal(db, clinicId, createdBy, sourcePlanId, {
    clientId: targetClientId,
  })
}

interface CloneOverrides {
  clientId?: string | null
  isTemplate?: boolean
  templateCategory?: PlanTemplateCategory | null
  status?: PlanStatus
  name?: string
}

// GÖREV 3 + GÖREV 4 (duplicatePlan) ortak çekirdeği: plan + tüm days/meals/
// items/alternatives'ı TEK bir transaction içinde derin kopyalar. id eşleme
// tabloları (dayIdMap, mealIdMap, itemIdMap), üst nesnenin YENİ id'sini alt
// nesnelerin FK'sinde kullanabilmek için tutuluyor.
async function clonePlanInternal(
  db: Database,
  clinicId: string,
  createdBy: string,
  sourcePlanId: string,
  overrides: CloneOverrides,
) {
  const source = await getPlanTree(db, clinicId, sourcePlanId)
  if (!source) throw new Error('Kaynak plan bulunamadı.')

  return db.transaction(async (tx) => {
    const [clonedPlan] = await tx
      .insert(dietPlans)
      .values({
        clinicId,
        clientId: overrides.clientId !== undefined ? overrides.clientId : source.plan.clientId,
        name: overrides.name ?? `${source.plan.name} (kopya)`,
        startDate: source.plan.startDate,
        endDate: source.plan.endDate,
        targetKcal: source.plan.targetKcal,
        targetMacros: source.plan.targetMacros,
        planType: source.plan.planType,
        status: overrides.status ?? 'taslak',
        isTemplate: overrides.isTemplate ?? false,
        templateCategory:
          overrides.templateCategory !== undefined
            ? overrides.templateCategory
            : source.plan.templateCategory,
        createdBy,
        notes: source.plan.notes,
        generalInstructions: source.plan.generalInstructions,
        // GitHub issue #28 / Prompt 5.6 — çıktı formatı tercihi diğer plan
        // meta alanları gibi (targetKcal, targetMacros...) kaynaktan aynen
        // kopyalanır.
        outputFormat: source.plan.outputFormat,
        // computedTotals BİLİNÇLİ olarak taşınmıyor — kopyanın kendi
        // yeniden hesaplanması gerekir (bkz. GÖREV 2 notu), eski bir
        // klinik/danışan hedefine göre hesaplanmış değer yanıltıcı olurdu.
      })
      .returning()
    if (!clonedPlan) throw new Error('Plan kopyalanamadı.')

    for (const { day, meals } of source.days) {
      const [clonedDay] = await tx
        .insert(planDays)
        .values({
          planId: clonedPlan.id,
          dayNumber: day.dayNumber,
          dayLabel: day.dayLabel,
          notes: day.notes,
        })
        .returning()
      if (!clonedDay) throw new Error('Gün kopyalanamadı.')

      for (const { meal, items } of meals) {
        const [clonedMeal] = await tx
          .insert(planMeals)
          .values({
            dayId: clonedDay.id,
            mealType: meal.mealType,
            time: meal.time,
            name: meal.name,
            sortOrder: meal.sortOrder,
            notes: meal.notes,
          })
          .returning()
        if (!clonedMeal) throw new Error('Öğün kopyalanamadı.')

        for (const { item, alternatives } of items) {
          const [clonedItem] = await tx
            .insert(planItems)
            .values({
              mealId: clonedMeal.id,
              foodId: item.foodId,
              recipeId: item.recipeId,
              freeText: item.freeText,
              amount: item.amount,
              portionId: item.portionId,
              sortOrder: item.sortOrder,
              isOptional: item.isOptional,
              note: item.note,
            })
            .returning()
          if (!clonedItem) throw new Error('Plan kalemi kopyalanamadı.')

          if (alternatives.length > 0) {
            await tx.insert(planItemAlternatives).values(
              alternatives.map((alt) => ({
                itemId: clonedItem.id,
                foodId: alt.foodId,
                recipeId: alt.recipeId,
                freeText: alt.freeText,
                amount: alt.amount,
                portionId: alt.portionId,
                sortOrder: alt.sortOrder,
              })),
            )
          }
        }
      }
    }

    // GitHub issue #27 / Prompt 5.5 — bkz. schema/plans.ts templateUsageCount
    // üstündeki not: bir ŞABLONdan gerçek (isTemplate=false) bir kopya
        // üretildiğinde ("bu şablondan plan oluştur" akışı) kaynağın sayacı
    // artar. saveAsTemplate (isTemplate=true override) ve düz duplicatePlan
    // (kaynak zaten şablon DEĞİL) bu koşulu tetiklemez.
    if (source.plan.isTemplate && overrides.isTemplate !== true) {
      await tx
        .update(dietPlans)
        .set({ templateUsageCount: sql`${dietPlans.templateUsageCount} + 1` })
        .where(eq(dietPlans.id, source.plan.id))
    }

    return clonedPlan
  })
}

// duplicatePlan server action'ı roadmap'te AYRI bir isim olarak listelense
// de (GÖREV 4), davranışı clonePlan(sourceId, sourceClientId) ile birebir
// aynı — aynı danışan için bir kopya üretmek. apps/web katmanı bu ayrımı
// (isimlendirme + audit log entityType) korumak için ayrı bir server action
// export eder, ama ikisi de burayı çağırır.
export async function duplicatePlan(
  db: Database,
  clinicId: string,
  createdBy: string,
  sourcePlanId: string,
) {
  const source = await getPlanById(db, clinicId, sourcePlanId)
  if (!source) throw new Error('Kaynak plan bulunamadı.')
  return clonePlanInternal(db, clinicId, createdBy, sourcePlanId, {
    clientId: source.clientId,
    name: `${source.name} (kopya)`,
  })
}

// --- GÖREV 4: hedeften plan iskeleti --------------------------------------
//
// GitHub issue #27 / Prompt 5.5, GÖREV 4 — "TEE hesapla → hedef kalori öner
// → makro dağılımı seç → öğün sayısı seç → öğünlere kalori dağıt → boş
// iskelet oluştur". TEE hesabı ve kalori dağıtımı packages/nutrition-core/
// src/plan-skeleton.ts'te SAF fonksiyonlar olarak yaşıyor (bkz. o dosyanın
// başı) — burası SADECE sonucu kalıcı hale getiriyor: bir plan + tek bir gün
// + verilen öğün listesi, HİÇBİR plan_items YOK ("Otomatik besin ÖNERME"
// kuralı, bkz. roadmap GÖREV 4 son satırı). ensurePlanBootstrapped
// (apps/web/.../[planId]/page.tsx) ile AYNI şekli üretir, ama TEK bir
// transaction'da (o fonksiyon sıralı action çağrılarıyla yapıyordu, çünkü o
// an elinde zaten bir boş plan vardı; burada plan da AYNI anda kuruluyor).
export interface PlanSkeletonMealInput {
  mealType: PlanMealType
  name: string
  sortOrder: number
}

export interface PlanSkeletonInput {
  clientId: string
  name: string
  targetKcal: number
  targetMacros: Record<string, number>
  planType?: PlanType
  meals: PlanSkeletonMealInput[]
}

export async function createPlanSkeleton(
  db: Database,
  clinicId: string,
  createdBy: string,
  input: PlanSkeletonInput,
) {
  await assertPlanClientInClinic(db, clinicId, input.clientId)
  return db.transaction(async (tx) => {
    const [plan] = await tx
      .insert(dietPlans)
      .values({
        clinicId,
        clientId: input.clientId,
        name: input.name,
        targetKcal: input.targetKcal,
        targetMacros: input.targetMacros,
        planType: input.planType ?? 'günlük',
        status: 'taslak',
        isTemplate: false,
        createdBy,
      })
      .returning()
    if (!plan) throw new Error('Plan oluşturulamadı.')

    const [day] = await tx
      .insert(planDays)
      .values({ planId: plan.id, dayNumber: 1 })
      .returning()
    if (!day) throw new Error('Gün oluşturulamadı.')

    if (input.meals.length > 0) {
      await tx.insert(planMeals).values(
        input.meals.map((meal) => ({
          dayId: day.id,
          mealType: meal.mealType,
          name: meal.name,
          sortOrder: meal.sortOrder,
          time: null,
        })),
      )
    }

    return plan
  })
}

import { calculateRecipeNutrition } from '@ogun/nutrition-core'
import { and, count, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm'
import type { Database } from '../client'
import { normalizeSearchText } from '../lib/normalize'
import {
  dataSources,
  foodCatalogEvents,
  foodNutrients,
  foodPortions,
  foods,
  foodSourceReferences,
  nutrients,
  platformAuditLogs,
  recipeCatalogEvents,
  recipeIngredients,
  recipes,
  recipeSourceReferences,
  retentionFactors,
  type CatalogEditorialStatus,
} from '../schema'

const REQUIRED_MACRO_CODES = ['ENERC_KCAL', 'PROCNT', 'CHOCDF', 'FAT'] as const
const EDITORIAL_TRANSITIONS: Record<CatalogEditorialStatus, readonly CatalogEditorialStatus[]> = {
  draft: ['in_review'],
  in_review: ['draft', 'published'],
  published: ['archived'],
  archived: ['draft'],
}

export class FoodCatalogOperationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'FoodCatalogOperationError'
  }
}

export function assertCatalogTransition(from: CatalogEditorialStatus, to: CatalogEditorialStatus) {
  if (!EDITORIAL_TRANSITIONS[from].includes(to))
    throw new FoodCatalogOperationError(
      'invalid_transition',
      `${from} → ${to} geçişine izin verilmiyor.`,
    )
}

export function parseNonNegativeDecimal(value: string | number, label = 'Değer') {
  const normalized = typeof value === 'string' ? value.trim().replace(',', '.') : value
  if (normalized === '')
    throw new FoodCatalogOperationError('invalid_number', `${label} boş olamaz.`)
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed) || parsed < 0)
    throw new FoodCatalogOperationError(
      'invalid_number',
      `${label} sonlu ve sıfırdan büyük/eşit olmalıdır.`,
    )
  return String(normalized)
}

function positiveDecimal(value: string | number, label: string) {
  const parsed = Number(parseNonNegativeDecimal(value, label))
  if (parsed <= 0)
    throw new FoodCatalogOperationError('invalid_number', `${label} sıfırdan büyük olmalıdır.`)
  return String(typeof value === 'string' ? value.trim().replace(',', '.') : value)
}

interface Actor {
  actorUserId: string
  platformStaffId: string
  ipAddress?: string | null
  userAgent?: string | null
}

function auditValues(
  actor: Actor,
  action: string,
  entityType: string,
  entityId: string,
  metadata?: Record<string, unknown>,
) {
  return {
    actorUserId: actor.actorUserId,
    platformStaffId: actor.platformStaffId,
    action,
    entityType,
    entityId,
    outcome: 'success' as const,
    ipAddress: actor.ipAddress ?? null,
    userAgent: actor.userAgent ?? null,
    metadata,
  }
}

async function resolveOgunSource(db: Database) {
  const [source] = await db
    .select({ id: dataSources.id })
    .from(dataSources)
    .where(eq(dataSources.code, 'OGUN'))
    .limit(1)
  if (!source)
    throw new FoodCatalogOperationError('missing_ogun_source', 'OGUN data source bulunamadı.')
  return source
}

async function writableFood(db: Database, foodId: string) {
  const [food] = await db
    .select({
      id: foods.id,
      nameTr: foods.nameTr,
      nameEn: foods.nameEn,
      groupCode: foods.groupCode,
      groupNameTr: foods.groupNameTr,
      preparation: foods.preparation,
      status: foods.editorialStatus,
      isPlatformManaged: foods.isPlatformManaged,
      source: dataSources.code,
    })
    .from(foods)
    .innerJoin(dataSources, eq(dataSources.id, foods.sourceId))
    .where(eq(foods.id, foodId))
    .limit(1)
  if (!food) throw new FoodCatalogOperationError('not_found', 'Besin bulunamadı.')
  if (!food.isPlatformManaged || food.source !== 'OGUN')
    throw new FoodCatalogOperationError(
      'external_read_only',
      'Harici kaynak besinleri doğrudan düzenlenemez.',
    )
  return food
}

export async function createPlatformFood(
  db: Database,
  input: Actor & {
    nameTr: string
    nameEn?: string | null
    groupCode?: string | null
    groupNameTr?: string | null
    preparation?: typeof foods.$inferInsert.preparation
  },
) {
  const nameTr = input.nameTr.trim()
  if (nameTr.length < 2)
    throw new FoodCatalogOperationError('invalid_name', 'Türkçe ad en az 2 karakter olmalıdır.')
  const source = await resolveOgunSource(db)
  return db.transaction(async (tx) => {
    const [food] = await tx
      .insert(foods)
      .values({
        sourceId: source.id,
        sourceCode: `PLATFORM-${crypto.randomUUID()}`,
        nameTr,
        nameEn: input.nameEn?.trim() || null,
        searchText: normalizeSearchText(`${nameTr} ${input.nameEn ?? ''}`),
        groupCode: input.groupCode?.trim() || null,
        groupNameTr: input.groupNameTr?.trim() || null,
        preparation: input.preparation ?? null,
        isPlatformManaged: true,
        editorialStatus: 'draft',
        isVerified: false,
        needsTranslation: false,
        createdBy: input.actorUserId,
      })
      .returning()
    if (!food) throw new FoodCatalogOperationError('create_failed', 'Besin oluşturulamadı.')
    await tx.insert(foodCatalogEvents).values({
      foodId: food.id,
      eventType: 'created',
      actorPlatformStaffId: input.platformStaffId,
    })
    await tx.insert(platformAuditLogs).values(auditValues(input, 'food.created', 'food', food.id))
    return food
  })
}

export async function updatePlatformFood(
  db: Database,
  input: Actor & {
    foodId: string
    nameTr: string
    nameEn?: string | null
    groupCode?: string | null
    groupNameTr?: string | null
    preparation?: typeof foods.$inferInsert.preparation
  },
) {
  const current = await writableFood(db, input.foodId)
  const nameTr = input.nameTr.trim()
  if (nameTr.length < 2)
    throw new FoodCatalogOperationError('invalid_name', 'Türkçe ad en az 2 karakter olmalıdır.')
  const next = {
    nameTr,
    nameEn: input.nameEn?.trim() || null,
    groupCode: input.groupCode?.trim() || null,
    groupNameTr: input.groupNameTr?.trim() || null,
    preparation: input.preparation ?? null,
  }
  return db.transaction(async (tx) => {
    const [food] = await tx
      .update(foods)
      .set({ ...next, searchText: normalizeSearchText(`${nameTr} ${next.nameEn ?? ''}`) })
      .where(eq(foods.id, input.foodId))
      .returning()
    await tx.insert(foodCatalogEvents).values({
      foodId: input.foodId,
      eventType: 'general_updated',
      actorPlatformStaffId: input.platformStaffId,
      changes: { before: current, after: next },
    })
    await tx
      .insert(platformAuditLogs)
      .values(
        auditValues(input, 'food.updated', 'food', input.foodId, { fields: Object.keys(next) }),
      )
    return food!
  })
}

export async function replacePlatformFoodNutrients(
  db: Database,
  input: Actor & {
    foodId: string
    values: Array<{ nutrientId: string; valuePer100g: string | number }>
  },
) {
  await writableFood(db, input.foodId)
  const source = await resolveOgunSource(db)
  const seen = new Set<string>()
  const values = input.values.map((row) => {
    if (seen.has(row.nutrientId))
      throw new FoodCatalogOperationError(
        'duplicate_nutrient',
        'Aynı besin öğesi iki kez girilemez.',
      )
    seen.add(row.nutrientId)
    return {
      foodId: input.foodId,
      nutrientId: row.nutrientId,
      sourceId: source.id,
      valuePer100g: parseNonNegativeDecimal(row.valuePer100g, 'Besin öğesi değeri'),
      isPreferred: true,
      isImputed: false,
    }
  })
  if (seen.size) {
    const definitions = await db
      .select({ id: nutrients.id })
      .from(nutrients)
      .where(inArray(nutrients.id, [...seen]))
    if (definitions.length !== seen.size)
      throw new FoodCatalogOperationError(
        'unknown_nutrient',
        'Bilinmeyen canonical nutrient seçildi.',
      )
  }
  return db.transaction(async (tx) => {
    await tx
      .delete(foodNutrients)
      .where(and(eq(foodNutrients.foodId, input.foodId), eq(foodNutrients.sourceId, source.id)))
    if (values.length) await tx.insert(foodNutrients).values(values)
    await tx.insert(foodCatalogEvents).values({
      foodId: input.foodId,
      eventType: 'nutrients_updated',
      actorPlatformStaffId: input.platformStaffId,
      changes: { nutrientIds: [...seen] },
    })
    await tx.insert(platformAuditLogs).values(
      auditValues(input, 'food.nutrients_updated', 'food', input.foodId, {
        nutrientCount: values.length,
      }),
    )
    return { count: values.length }
  })
}

export async function replacePlatformFoodPortions(
  db: Database,
  input: Actor & {
    foodId: string
    portions: Array<{
      label: string
      grams: string | number
      isDefault?: boolean
      sortOrder?: number
    }>
  },
) {
  await writableFood(db, input.foodId)
  if (input.portions.filter((p) => p.isDefault).length > 1)
    throw new FoodCatalogOperationError(
      'multiple_defaults',
      'En fazla bir varsayılan porsiyon olabilir.',
    )
  const portions = input.portions.map((portion, index) => {
    const label = portion.label.trim()
    if (!label)
      throw new FoodCatalogOperationError('invalid_portion', 'Porsiyon etiketi boş olamaz.')
    return {
      foodId: input.foodId,
      label,
      grams: positiveDecimal(portion.grams, 'Porsiyon gramı'),
      isDefault: Boolean(portion.isDefault),
      sortOrder: Number.isInteger(portion.sortOrder) ? portion.sortOrder! : index,
    }
  })
  return db.transaction(async (tx) => {
    await tx.delete(foodPortions).where(eq(foodPortions.foodId, input.foodId))
    if (portions.length) await tx.insert(foodPortions).values(portions)
    await tx.insert(foodCatalogEvents).values({
      foodId: input.foodId,
      eventType: 'portions_updated',
      actorPlatformStaffId: input.platformStaffId,
      changes: { count: portions.length },
    })
    await tx.insert(platformAuditLogs).values(
      auditValues(input, 'food.portions_updated', 'food', input.foodId, {
        portionCount: portions.length,
      }),
    )
    return { count: portions.length }
  })
}

export async function addPlatformFoodReference(
  db: Database,
  input: Actor & {
    foodId: string
    title: string
    citation: string
    url?: string | null
    note?: string | null
  },
) {
  await writableFood(db, input.foodId)
  if (!input.title.trim() || !input.citation.trim())
    throw new FoodCatalogOperationError(
      'invalid_reference',
      'Kaynak başlığı ve citation zorunludur.',
    )
  if (input.url && !/^https?:\/\//i.test(input.url))
    throw new FoodCatalogOperationError('invalid_url', 'Kaynak URL http/https olmalıdır.')
  return db.transaction(async (tx) => {
    const [reference] = await tx
      .insert(foodSourceReferences)
      .values({
        foodId: input.foodId,
        title: input.title.trim(),
        citation: input.citation.trim(),
        url: input.url?.trim() || null,
        note: input.note?.trim() || null,
        createdByPlatformStaffId: input.platformStaffId,
      })
      .returning()
    await tx.insert(foodCatalogEvents).values({
      foodId: input.foodId,
      eventType: 'reference_added',
      actorPlatformStaffId: input.platformStaffId,
      changes: { referenceId: reference!.id },
    })
    await tx.insert(platformAuditLogs).values(
      auditValues(input, 'food.reference_added', 'food', input.foodId, {
        referenceId: reference!.id,
      }),
    )
    return reference!
  })
}

async function validateFoodPublication(db: Database, foodId: string) {
  const food = await writableFood(db, foodId)
  if (food.nameTr.trim().length < 2)
    throw new FoodCatalogOperationError('publish_validation', 'Geçerli Türkçe ad zorunludur.')
  const definitions = await db
    .select({ id: nutrients.id, code: nutrients.code })
    .from(nutrients)
    .where(inArray(nutrients.code, [...REQUIRED_MACRO_CODES]))
  if (definitions.length !== REQUIRED_MACRO_CODES.length)
    throw new FoodCatalogOperationError('seed_incomplete', 'Canonical temel makro tanımları eksik.')
  const values = await db
    .select({ nutrientId: foodNutrients.nutrientId })
    .from(foodNutrients)
    .where(
      and(
        eq(foodNutrients.foodId, foodId),
        eq(foodNutrients.isPreferred, true),
        inArray(
          foodNutrients.nutrientId,
          definitions.map((n) => n.id),
        ),
      ),
    )
  if (new Set(values.map((v) => v.nutrientId)).size !== definitions.length)
    throw new FoodCatalogOperationError(
      'publish_validation',
      'Enerji, protein, karbonhidrat ve yağ değerleri zorunludur.',
    )
  const [portion] = await db
    .select({ id: foodPortions.id })
    .from(foodPortions)
    .where(and(eq(foodPortions.foodId, foodId), eq(foodPortions.isDefault, true)))
    .limit(1)
  if (!portion)
    throw new FoodCatalogOperationError('publish_validation', 'Varsayılan porsiyon zorunludur.')
  const [reference] = await db
    .select({ id: foodSourceReferences.id })
    .from(foodSourceReferences)
    .where(eq(foodSourceReferences.foodId, foodId))
    .limit(1)
  if (!reference)
    throw new FoodCatalogOperationError(
      'publish_validation',
      'En az bir kaynak/citation zorunludur.',
    )
}

export async function transitionPlatformFood(
  db: Database,
  input: Actor & { foodId: string; toStatus: CatalogEditorialStatus },
) {
  const food = await writableFood(db, input.foodId)
  assertCatalogTransition(food.status, input.toStatus)
  if (input.toStatus === 'published') await validateFoodPublication(db, input.foodId)
  if (input.toStatus === 'archived') {
    const [dependency] = await db
      .select({ total: count() })
      .from(recipeIngredients)
      .innerJoin(recipes, eq(recipes.id, recipeIngredients.recipeId))
      .where(
        and(
          eq(recipeIngredients.foodId, input.foodId),
          eq(recipes.editorialStatus, 'published'),
          eq(recipes.isPublic, true),
        ),
      )
    if ((dependency?.total ?? 0) > 0)
      throw new FoodCatalogOperationError(
        'published_recipe_dependency',
        `Bu besin ${dependency!.total} yayındaki tarif tarafından kullanılıyor.`,
      )
  }
  const event =
    input.toStatus === 'in_review'
      ? 'submitted_for_review'
      : input.toStatus === 'draft'
        ? 'returned_to_draft'
        : input.toStatus
  const action = input.toStatus === 'in_review' ? 'food.submitted' : `food.${input.toStatus}`
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(foods)
      .set({
        editorialStatus: input.toStatus,
        ...(input.toStatus === 'published'
          ? {
              isVerified: true,
              publishedAt: new Date(),
              publishedByPlatformStaffId: input.platformStaffId,
            }
          : {}),
      })
      .where(and(eq(foods.id, input.foodId), eq(foods.editorialStatus, food.status)))
      .returning()
    if (!updated)
      throw new FoodCatalogOperationError(
        'concurrent_change',
        'Besin durumu eşzamanlı olarak değişti.',
      )
    await tx.insert(foodCatalogEvents).values({
      foodId: input.foodId,
      eventType: event,
      actorPlatformStaffId: input.platformStaffId,
      changes: { from: food.status, to: input.toStatus },
    })
    await tx
      .insert(platformAuditLogs)
      .values(
        auditValues(input, action, 'food', input.foodId, { from: food.status, to: input.toStatus }),
      )
    return updated
  })
}

export interface PlatformFoodFilters {
  search?: string
  source?: string
  status?: CatalogEditorialStatus
  verified?: boolean
  needsTranslation?: boolean
  preparation?: string
  group?: string
  page?: number
  pageSize?: 25 | 50 | 100
}

export async function listFoodsForPlatform(db: Database, filters: PlatformFoodFilters = {}) {
  const conditions = []
  if (filters.search?.trim())
    conditions.push(
      or(
        ilike(foods.searchText, `%${normalizeSearchText(filters.search)}%`),
        ilike(foods.nameTr, `%${filters.search.trim()}%`),
      )!,
    )
  if (filters.source)
    conditions.push(eq(dataSources.code, filters.source as typeof dataSources.$inferSelect.code))
  if (filters.status) conditions.push(eq(foods.editorialStatus, filters.status))
  if (filters.verified !== undefined) conditions.push(eq(foods.isVerified, filters.verified))
  if (filters.needsTranslation !== undefined)
    conditions.push(eq(foods.needsTranslation, filters.needsTranslation))
  if (filters.preparation)
    conditions.push(
      eq(
        foods.preparation,
        filters.preparation as NonNullable<typeof foods.$inferSelect.preparation>,
      ),
    )
  if (filters.group) conditions.push(eq(foods.groupCode, filters.group))
  const where = conditions.length ? and(...conditions) : undefined
  const page = Math.max(1, Math.trunc(filters.page ?? 1)),
    pageSize = ([25, 50, 100] as const).includes(filters.pageSize as 25 | 50 | 100)
      ? filters.pageSize!
      : 25
  const nutrientCoverage = sql<number>`(select count(*)::int from ${foodNutrients} fn where fn.food_id=${foods.id} and fn.is_preferred=true)`
  const portionCount = sql<number>`(select count(*)::int from ${foodPortions} fp where fp.food_id=${foods.id})`
  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: foods.id,
        nameTr: foods.nameTr,
        source: dataSources.code,
        groupNameTr: foods.groupNameTr,
        preparation: foods.preparation,
        editorialStatus: foods.editorialStatus,
        isVerified: foods.isVerified,
        needsTranslation: foods.needsTranslation,
        isPlatformManaged: foods.isPlatformManaged,
        nutrientCoverage,
        portionCount,
        updatedAt: foods.updatedAt,
      })
      .from(foods)
      .innerJoin(dataSources, eq(dataSources.id, foods.sourceId))
      .where(where)
      .orderBy(desc(foods.updatedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ total: count() })
      .from(foods)
      .innerJoin(dataSources, eq(dataSources.id, foods.sourceId))
      .where(where),
  ])
  return { rows, total: total?.total ?? 0, page, pageSize }
}

export async function getFoodForPlatform(db: Database, foodId: string) {
  const [food] = await db
    .select({
      id: foods.id,
      nameTr: foods.nameTr,
      nameEn: foods.nameEn,
      searchText: foods.searchText,
      groupCode: foods.groupCode,
      groupNameTr: foods.groupNameTr,
      preparation: foods.preparation,
      isVerified: foods.isVerified,
      needsTranslation: foods.needsTranslation,
      isPlatformManaged: foods.isPlatformManaged,
      editorialStatus: foods.editorialStatus,
      publishedAt: foods.publishedAt,
      source: dataSources.code,
      sourceName: dataSources.name,
      updatedAt: foods.updatedAt,
      createdAt: foods.createdAt,
    })
    .from(foods)
    .innerJoin(dataSources, eq(dataSources.id, foods.sourceId))
    .where(eq(foods.id, foodId))
    .limit(1)
  if (!food) return null
  const [nutrientRows, portions, references, events, definitions] = await Promise.all([
    db
      .select({
        nutrientId: nutrients.id,
        code: nutrients.code,
        nameTr: nutrients.nameTr,
        unit: nutrients.unit,
        category: nutrients.category,
        displayOrder: nutrients.displayOrder,
        valuePer100g: foodNutrients.valuePer100g,
        source: dataSources.code,
        isPreferred: foodNutrients.isPreferred,
      })
      .from(foodNutrients)
      .innerJoin(nutrients, eq(nutrients.id, foodNutrients.nutrientId))
      .innerJoin(dataSources, eq(dataSources.id, foodNutrients.sourceId))
      .where(eq(foodNutrients.foodId, foodId))
      .orderBy(nutrients.displayOrder),
    db
      .select()
      .from(foodPortions)
      .where(eq(foodPortions.foodId, foodId))
      .orderBy(foodPortions.sortOrder),
    db
      .select()
      .from(foodSourceReferences)
      .where(eq(foodSourceReferences.foodId, foodId))
      .orderBy(desc(foodSourceReferences.createdAt)),
    db
      .select()
      .from(foodCatalogEvents)
      .where(eq(foodCatalogEvents.foodId, foodId))
      .orderBy(desc(foodCatalogEvents.createdAt)),
    db.select().from(nutrients).orderBy(nutrients.displayOrder),
  ])
  const knownMicros = new Set(
    nutrientRows.filter((n) => n.category !== 'makro' && n.isPreferred).map((n) => n.nutrientId),
  )
  const totalMicros = definitions.filter((n) => n.category !== 'makro').length
  return {
    ...food,
    nutrients: nutrientRows,
    portions,
    references,
    events,
    definitions,
    microCoverage: { known: knownMicros.size, total: totalMicros },
  }
}

async function writableRecipe(db: Database, recipeId: string) {
  const [recipe] = await db.select().from(recipes).where(eq(recipes.id, recipeId)).limit(1)
  if (!recipe) throw new FoodCatalogOperationError('not_found', 'Tarif bulunamadı.')
  if (!recipe.isPlatformManaged || recipe.clinicId !== null)
    throw new FoodCatalogOperationError(
      'out_of_scope',
      'Klinik tarifleri platform backoffice kapsamında değildir.',
    )
  return recipe
}

export async function createPlatformRecipe(
  db: Database,
  input: Actor & {
    nameTr: string
    servings: number
    totalYieldGrams: string | number
    cookingMethod?: string | null
    instructions?: string | null
  },
) {
  if (input.nameTr.trim().length < 2)
    throw new FoodCatalogOperationError('invalid_name', 'Tarif adı en az 2 karakter olmalıdır.')
  if (!Number.isInteger(input.servings) || input.servings < 1)
    throw new FoodCatalogOperationError('invalid_servings', 'Porsiyon sayısı en az 1 olmalıdır.')
  return db.transaction(async (tx) => {
    const [recipe] = await tx
      .insert(recipes)
      .values({
        clinicId: null,
        nameTr: input.nameTr.trim(),
        servings: input.servings,
        totalYieldGrams: positiveDecimal(input.totalYieldGrams, 'Toplam pişmiş ağırlık'),
        cookingMethod: input.cookingMethod?.trim() || null,
        instructions: input.instructions?.trim() || null,
        isPlatformManaged: true,
        editorialStatus: 'draft',
        isPublic: false,
      })
      .returning()
    await tx.insert(recipeCatalogEvents).values({
      recipeId: recipe!.id,
      eventType: 'created',
      actorPlatformStaffId: input.platformStaffId,
    })
    await tx
      .insert(platformAuditLogs)
      .values(auditValues(input, 'recipe.created', 'recipe', recipe!.id))
    return recipe!
  })
}

export async function updatePlatformRecipe(
  db: Database,
  input: Actor & {
    recipeId: string
    nameTr: string
    servings: number
    totalYieldGrams: string | number
    cookingMethod?: string | null
    instructions?: string | null
  },
) {
  const current = await writableRecipe(db, input.recipeId)
  if (input.nameTr.trim().length < 2 || !Number.isInteger(input.servings) || input.servings < 1)
    throw new FoodCatalogOperationError('invalid_recipe', 'Tarif adı ve porsiyon sayısı geçersiz.')
  const next = {
    nameTr: input.nameTr.trim(),
    servings: input.servings,
    totalYieldGrams: positiveDecimal(input.totalYieldGrams, 'Toplam pişmiş ağırlık'),
    cookingMethod: input.cookingMethod?.trim() || null,
    instructions: input.instructions?.trim() || null,
  }
  return db.transaction(async (tx) => {
    const [recipe] = await tx
      .update(recipes)
      .set(next)
      .where(eq(recipes.id, input.recipeId))
      .returning()
    await tx.insert(recipeCatalogEvents).values({
      recipeId: input.recipeId,
      eventType: 'updated',
      actorPlatformStaffId: input.platformStaffId,
      changes: {
        before: {
          nameTr: current.nameTr,
          servings: current.servings,
          totalYieldGrams: current.totalYieldGrams,
        },
        after: next,
      },
    })
    await tx
      .insert(platformAuditLogs)
      .values(auditValues(input, 'recipe.updated', 'recipe', input.recipeId))
    return recipe!
  })
}

export async function replacePlatformRecipeIngredients(
  db: Database,
  input: Actor & {
    recipeId: string
    ingredients: Array<{ foodId: string; amountGrams: string | number; portionId?: string | null }>
  },
) {
  await writableRecipe(db, input.recipeId)
  if (!input.ingredients.length)
    throw new FoodCatalogOperationError('ingredients_required', 'En az bir malzeme zorunludur.')
  const ids = [...new Set(input.ingredients.map((i) => i.foodId))]
  const eligibleFoods = await db
    .select({ id: foods.id })
    .from(foods)
    .where(
      and(
        inArray(foods.id, ids),
        or(eq(foods.isPlatformManaged, false), eq(foods.editorialStatus, 'published'))!,
      ),
    )
  if (eligibleFoods.length !== ids.length)
    throw new FoodCatalogOperationError(
      'food_not_eligible',
      'Taslak/arşivlenmiş besin tarife eklenemez.',
    )
  const portionIds = input.ingredients.flatMap((i) => (i.portionId ? [i.portionId] : []))
  const portionRows = portionIds.length
    ? await db
        .select({ id: foodPortions.id, foodId: foodPortions.foodId })
        .from(foodPortions)
        .where(inArray(foodPortions.id, portionIds))
    : []
  const portionFood = new Map(portionRows.map((p) => [p.id, p.foodId]))
  const rows = input.ingredients.map((item, index) => {
    if (item.portionId && portionFood.get(item.portionId) !== item.foodId)
      throw new FoodCatalogOperationError('portion_mismatch', 'Porsiyon seçilen besine ait değil.')
    return {
      recipeId: input.recipeId,
      foodId: item.foodId,
      amountGrams: positiveDecimal(item.amountGrams, 'Malzeme gramı'),
      portionId: item.portionId ?? null,
      sortOrder: index,
    }
  })
  return db.transaction(async (tx) => {
    await tx.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, input.recipeId))
    await tx.insert(recipeIngredients).values(rows)
    await tx.insert(recipeCatalogEvents).values({
      recipeId: input.recipeId,
      eventType: 'ingredients_updated',
      actorPlatformStaffId: input.platformStaffId,
      changes: { ingredientCount: rows.length },
    })
    await tx.insert(platformAuditLogs).values(
      auditValues(input, 'recipe.ingredients_updated', 'recipe', input.recipeId, {
        ingredientCount: rows.length,
      }),
    )
    return { count: rows.length }
  })
}

export async function addPlatformRecipeReference(
  db: Database,
  input: Actor & {
    recipeId: string
    title: string
    citation: string
    url?: string | null
    note?: string | null
  },
) {
  await writableRecipe(db, input.recipeId)
  if (!input.title.trim() || !input.citation.trim())
    throw new FoodCatalogOperationError(
      'invalid_reference',
      'Kaynak başlığı ve citation zorunludur.',
    )
  if (input.url && !/^https?:\/\//i.test(input.url))
    throw new FoodCatalogOperationError('invalid_url', 'Kaynak URL http/https olmalıdır.')
  return db.transaction(async (tx) => {
    const [reference] = await tx
      .insert(recipeSourceReferences)
      .values({
        recipeId: input.recipeId,
        title: input.title.trim(),
        citation: input.citation.trim(),
        url: input.url?.trim() || null,
        note: input.note?.trim() || null,
        createdByPlatformStaffId: input.platformStaffId,
      })
      .returning()
    await tx.insert(recipeCatalogEvents).values({
      recipeId: input.recipeId,
      eventType: 'reference_added',
      actorPlatformStaffId: input.platformStaffId,
      changes: { referenceId: reference!.id },
    })
    await tx.insert(platformAuditLogs).values(
      auditValues(input, 'recipe.reference_added', 'recipe', input.recipeId, {
        referenceId: reference!.id,
      }),
    )
    return reference!
  })
}

export async function getRecipeForPlatform(db: Database, recipeId: string) {
  const [recipe] = await db
    .select()
    .from(recipes)
    .where(and(eq(recipes.id, recipeId), sql`${recipes.clinicId} is null`))
    .limit(1)
  if (!recipe) return null
  const [ingredients, references, events] = await Promise.all([
    db
      .select({
        id: recipeIngredients.id,
        foodId: foods.id,
        foodName: foods.nameTr,
        amountGrams: recipeIngredients.amountGrams,
        portionId: recipeIngredients.portionId,
      })
      .from(recipeIngredients)
      .innerJoin(foods, eq(foods.id, recipeIngredients.foodId))
      .where(eq(recipeIngredients.recipeId, recipeId))
      .orderBy(recipeIngredients.sortOrder),
    db
      .select()
      .from(recipeSourceReferences)
      .where(eq(recipeSourceReferences.recipeId, recipeId))
      .orderBy(desc(recipeSourceReferences.createdAt)),
    db
      .select()
      .from(recipeCatalogEvents)
      .where(eq(recipeCatalogEvents.recipeId, recipeId))
      .orderBy(desc(recipeCatalogEvents.createdAt)),
  ])
  const foodIds = ingredients.map((i) => i.foodId)
  const nutrientRows = foodIds.length
    ? await db
        .select({
          foodId: foodNutrients.foodId,
          code: nutrients.code,
          value: foodNutrients.valuePer100g,
        })
        .from(foodNutrients)
        .innerJoin(nutrients, eq(nutrients.id, foodNutrients.nutrientId))
        .where(and(inArray(foodNutrients.foodId, foodIds), eq(foodNutrients.isPreferred, true)))
    : []
  const perFood = new Map<string, Record<string, number>>()
  for (const row of nutrientRows)
    perFood.set(row.foodId, { ...(perFood.get(row.foodId) ?? {}), [row.code]: Number(row.value) })
  const factorRows = recipe.cookingMethod
    ? await db
        .select({ code: nutrients.code, factor: retentionFactors.factor })
        .from(retentionFactors)
        .innerJoin(nutrients, eq(nutrients.id, retentionFactors.nutrientId))
        .where(eq(retentionFactors.method, recipe.cookingMethod))
    : []
  const retention = Object.fromEntries(factorRows.map((f) => [f.code, Number(f.factor)]))
  const calculation =
    ingredients.length && recipe.totalYieldGrams
      ? calculateRecipeNutrition({
          ingredients: ingredients.map((i) => ({
            amountGrams: Number(i.amountGrams),
            nutrientsPer100g: perFood.get(i.foodId) ?? {},
          })),
          totalYieldGrams: Number(recipe.totalYieldGrams),
          servings: recipe.servings,
          ...(factorRows.length ? { retentionFactors: retention } : {}),
        })
      : null
  return {
    ...recipe,
    ingredients,
    references,
    events,
    calculation,
    cookingWarning:
      recipe.cookingMethod && !factorRows.length
        ? 'Bu hesap malzeme bazlıdır; bu pişirme yöntemi için retention factor bulunamadı.'
        : null,
  }
}

export async function transitionPlatformRecipe(
  db: Database,
  input: Actor & { recipeId: string; toStatus: CatalogEditorialStatus },
) {
  const recipe = await writableRecipe(db, input.recipeId)
  assertCatalogTransition(recipe.editorialStatus, input.toStatus)
  if (input.toStatus === 'published') {
    const detail = await getRecipeForPlatform(db, input.recipeId)
    if (
      !detail ||
      detail.nameTr.trim().length < 2 ||
      detail.servings < 1 ||
      !detail.totalYieldGrams ||
      !detail.ingredients.length ||
      !detail.references.length ||
      !detail.calculation
    )
      throw new FoodCatalogOperationError(
        'publish_validation',
        'Ad, porsiyon, pişmiş ağırlık, malzeme ve kaynak zorunludur.',
      )
    for (const code of REQUIRED_MACRO_CODES)
      if (!detail.calculation.nutrients[code]?.complete)
        throw new FoodCatalogOperationError(
          'publish_validation',
          `Temel makro coverage eksik: ${code}`,
        )
  }
  const event =
    input.toStatus === 'in_review'
      ? 'submitted_for_review'
      : input.toStatus === 'draft'
        ? 'returned_to_draft'
        : input.toStatus
  const action = input.toStatus === 'in_review' ? 'recipe.submitted' : `recipe.${input.toStatus}`
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(recipes)
      .set({
        editorialStatus: input.toStatus,
        isPublic: input.toStatus === 'published',
        ...(input.toStatus === 'published'
          ? { publishedAt: new Date(), publishedByPlatformStaffId: input.platformStaffId }
          : {}),
      })
      .where(
        and(eq(recipes.id, input.recipeId), eq(recipes.editorialStatus, recipe.editorialStatus)),
      )
      .returning()
    if (!updated)
      throw new FoodCatalogOperationError('concurrent_change', 'Tarif durumu eşzamanlı değişti.')
    await tx.insert(recipeCatalogEvents).values({
      recipeId: input.recipeId,
      eventType: event,
      actorPlatformStaffId: input.platformStaffId,
      changes: { from: recipe.editorialStatus, to: input.toStatus },
    })
    await tx.insert(platformAuditLogs).values(
      auditValues(input, action, 'recipe', input.recipeId, {
        from: recipe.editorialStatus,
        to: input.toStatus,
      }),
    )
    return updated
  })
}

export async function listRecipesForPlatform(
  db: Database,
  filters: {
    search?: string
    status?: CatalogEditorialStatus
    cookingMethod?: string
    page?: number
    pageSize?: 25 | 50 | 100
  } = {},
) {
  const conditions = [sql`${recipes.clinicId} is null`, eq(recipes.isPlatformManaged, true)]
  if (filters.search?.trim()) conditions.push(ilike(recipes.nameTr, `%${filters.search.trim()}%`))
  if (filters.status) conditions.push(eq(recipes.editorialStatus, filters.status))
  if (filters.cookingMethod) conditions.push(eq(recipes.cookingMethod, filters.cookingMethod))
  const where = and(...conditions),
    page = Math.max(1, Math.trunc(filters.page ?? 1)),
    pageSize = ([25, 50, 100] as const).includes(filters.pageSize as 25 | 50 | 100)
      ? filters.pageSize!
      : 25
  const ingredientCount = sql<number>`(select count(*)::int from ${recipeIngredients} ri where ri.recipe_id=${recipes.id})`
  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: recipes.id,
        nameTr: recipes.nameTr,
        editorialStatus: recipes.editorialStatus,
        servings: recipes.servings,
        totalYieldGrams: recipes.totalYieldGrams,
        cookingMethod: recipes.cookingMethod,
        ingredientCount,
        createdAt: recipes.createdAt,
        updatedAt: recipes.updatedAt,
      })
      .from(recipes)
      .where(where)
      .orderBy(desc(recipes.updatedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(recipes).where(where),
  ])
  return { rows, total: total?.total ?? 0, page, pageSize }
}

export async function listIngredientFoodsForPlatform(db: Database, query: string, limit = 20) {
  const normalized = normalizeSearchText(query)
  if (!normalized) return []
  return db
    .select({ id: foods.id, nameTr: foods.nameTr })
    .from(foods)
    .where(
      and(
        or(ilike(foods.searchText, `%${normalized}%`), ilike(foods.nameTr, `%${query.trim()}%`))!,
        or(eq(foods.isPlatformManaged, false), eq(foods.editorialStatus, 'published'))!,
      ),
    )
    .orderBy(foods.nameTr)
    .limit(Math.min(Math.max(limit, 1), 100))
}

export async function getFoodOperationsSummary(db: Database) {
  const [foodRows, recipeRows] = await Promise.all([
    db
      .select({ status: foods.editorialStatus, total: count() })
      .from(foods)
      .where(eq(foods.isPlatformManaged, true))
      .groupBy(foods.editorialStatus),
    db
      .select({ status: recipes.editorialStatus, total: count() })
      .from(recipes)
      .where(and(eq(recipes.isPlatformManaged, true), sql`${recipes.clinicId} is null`))
      .groupBy(recipes.editorialStatus),
  ])
  const food = Object.fromEntries(foodRows.map((r) => [r.status, r.total])),
    recipe = Object.fromEntries(recipeRows.map((r) => [r.status, r.total]))
  return {
    draftFoods: food.draft ?? 0,
    reviewFoods: food.in_review ?? 0,
    publishedFoods: food.published ?? 0,
    draftRecipes: recipe.draft ?? 0,
    reviewRecipes: recipe.in_review ?? 0,
  }
}

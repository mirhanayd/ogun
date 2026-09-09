import { createId } from '@paralleldrive/cuid2'
import { and, count, eq, inArray } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from '../client'
import {
  dataSources,
  foodCatalogEvents,
  foodNutrients,
  foodPortions,
  foods,
  nutrients,
  platformAuditLogs,
  platformStaff,
  recipeCatalogEvents,
  recipes,
  users,
} from '../schema'
import {
  getAllFoodIndexEntries,
  getAllFoodNutrientPackEntries,
  getAllFoodSearchIndexEntries,
  searchFoods,
} from './food-search'
import {
  FoodCatalogOperationError,
  addPlatformFoodReference,
  addPlatformRecipeReference,
  assertCatalogTransition,
  createPlatformFood,
  createPlatformRecipe,
  getRecipeForPlatform,
  parseNonNegativeDecimal,
  replacePlatformFoodNutrients,
  replacePlatformFoodPortions,
  replacePlatformRecipeIngredients,
  transitionPlatformFood,
  transitionPlatformRecipe,
  updatePlatformFood,
} from './food-catalog-operations'

const describeWithDb = process.env.FOOD_CATALOG_WRITE_TESTS === '1' ? describe : describe.skip

async function fixture() {
  const suffix = createId()
  const userId = `food-user-${suffix}`,
    staffId = `food-staff-${suffix}`
  await db
    .insert(users)
    .values({ id: userId, name: 'Food Editor', email: `${suffix}@food.test`, emailVerified: true })
  await db
    .insert(platformStaff)
    .values({ id: staffId, userId, role: 'food_editor', isActive: true })
  return { actorUserId: userId, platformStaffId: staffId, suffix }
}

async function macroIds() {
  const rows = await db
    .select({ id: nutrients.id, code: nutrients.code })
    .from(nutrients)
    .where(inArray(nutrients.code, ['ENERC_KCAL', 'PROCNT', 'CHOCDF', 'FAT', 'FIBTG']))
  return new Map(rows.map((row) => [row.code, row.id]))
}

async function readyFood(
  actor: Awaited<ReturnType<typeof fixture>>,
  name: string,
  values = [100, 10, 20, 5, 3],
) {
  const food = await createPlatformFood(db, { ...actor, nameTr: `${name} ${actor.suffix}` })
  const ids = await macroIds(),
    codes = ['ENERC_KCAL', 'PROCNT', 'CHOCDF', 'FAT', 'FIBTG']
  await replacePlatformFoodNutrients(db, {
    ...actor,
    foodId: food.id,
    values: codes.map((code, index) => ({
      nutrientId: ids.get(code)!,
      valuePer100g: values[index]!,
    })),
  })
  await replacePlatformFoodPortions(db, {
    ...actor,
    foodId: food.id,
    portions: [{ label: '1 porsiyon', grams: 100, isDefault: true }],
  })
  await addPlatformFoodReference(db, {
    ...actor,
    foodId: food.id,
    title: 'Test kaynağı',
    citation: 'Deterministic test citation',
  })
  await transitionPlatformFood(db, { ...actor, foodId: food.id, toStatus: 'in_review' })
  await transitionPlatformFood(db, { ...actor, foodId: food.id, toStatus: 'published' })
  return food
}

describe('food catalog primitives', () => {
  it('validates numeric input and the canonical transition graph', () => {
    expect(parseNonNegativeDecimal('1,2500')).toBe('1.2500')
    expect(() => parseNonNegativeDecimal('-1')).toThrow('sıfırdan büyük/eşit')
    expect(() => parseNonNegativeDecimal('Infinity')).toThrow('sonlu')
    expect(() => assertCatalogTransition('draft', 'published')).toThrow('izin verilmiyor')
    expect(() => assertCatalogTransition('draft', 'in_review')).not.toThrow()
  })
})

describeWithDb('food catalog operations integration', () => {
  it('creates OGUN drafts, protects external rows and enforces publication atomically', async () => {
    const actor = await fixture(),
      [externalSource] = await db
        .select()
        .from(dataSources)
        .where(eq(dataSources.code, 'BLS4'))
        .limit(1)
    const [external] = await db
      .insert(foods)
      .values({
        sourceId: externalSource!.id,
        sourceCode: `external-${actor.suffix}`,
        nameTr: `Harici ${actor.suffix}`,
        searchText: `harici ${actor.suffix}`,
        editorialStatus: 'published',
      })
      .returning()
    await expect(
      updatePlatformFood(db, { ...actor, foodId: external!.id, nameTr: 'Değiştir' }),
    ).rejects.toMatchObject({ code: 'external_read_only' })

    const food = await createPlatformFood(db, {
      ...actor,
      nameTr: `Taslak Mercimek ${actor.suffix}`,
      nameEn: 'Lentil',
    })
    expect(food.editorialStatus).toBe('draft')
    expect(food.isPlatformManaged).toBe(true)
    expect(food.isVerified).toBe(false)
    expect(await searchFoods(db, { query: actor.suffix })).toHaveLength(1)
    expect(
      (await searchFoods(db, { query: `taslak mercimek ${actor.suffix}` })).some(
        (row) => row.id === food.id,
      ),
    ).toBe(false)
    expect((await getAllFoodIndexEntries(db)).some((row) => row.id === food.id)).toBe(false)
    expect((await getAllFoodSearchIndexEntries(db)).some((row) => row.id === food.id)).toBe(false)
    expect((await getAllFoodNutrientPackEntries(db)).some((row) => row.id === food.id)).toBe(false)

    const ids = await macroIds()
    await expect(
      replacePlatformFoodNutrients(db, {
        ...actor,
        foodId: food.id,
        values: [{ nutrientId: ids.get('PROCNT')!, valuePer100g: -1 }],
      }),
    ).rejects.toMatchObject({ code: 'invalid_number' })
    await expect(
      replacePlatformFoodNutrients(db, {
        ...actor,
        foodId: food.id,
        values: [
          { nutrientId: ids.get('PROCNT')!, valuePer100g: 1 },
          { nutrientId: ids.get('PROCNT')!, valuePer100g: 2 },
        ],
      }),
    ).rejects.toMatchObject({ code: 'duplicate_nutrient' })
    await replacePlatformFoodNutrients(db, {
      ...actor,
      foodId: food.id,
      values: ['ENERC_KCAL', 'PROCNT', 'CHOCDF', 'FAT'].map((code, i) => ({
        nutrientId: ids.get(code)!,
        valuePer100g: [120, 8, 20, 2][i]!,
      })),
    })
    expect(
      (
        await db
          .select({ total: count() })
          .from(foodNutrients)
          .where(eq(foodNutrients.foodId, food.id))
      )[0]?.total,
    ).toBe(4)
    await expect(
      replacePlatformFoodPortions(db, {
        ...actor,
        foodId: food.id,
        portions: [
          { label: '1', grams: 50, isDefault: true },
          { label: '2', grams: 100, isDefault: true },
        ],
      }),
    ).rejects.toMatchObject({ code: 'multiple_defaults' })
    await replacePlatformFoodPortions(db, {
      ...actor,
      foodId: food.id,
      portions: [{ label: '1 kase', grams: 150, isDefault: true }],
    })
    await addPlatformFoodReference(db, {
      ...actor,
      foodId: food.id,
      title: 'Analiz',
      citation: 'Laboratuvar analizi',
    })
    await transitionPlatformFood(db, { ...actor, foodId: food.id, toStatus: 'in_review' })
    await expect(
      transitionPlatformFood(db, {
        ...actor,
        platformStaffId: 'missing-staff',
        foodId: food.id,
        toStatus: 'published',
      }),
    ).rejects.toBeTruthy()
    expect(
      (
        await db.select({ status: foods.editorialStatus }).from(foods).where(eq(foods.id, food.id))
      )[0]?.status,
    ).toBe('in_review')
    await transitionPlatformFood(db, { ...actor, foodId: food.id, toStatus: 'published' })
    expect(
      (await searchFoods(db, { query: `taslak mercimek ${actor.suffix}` })).some(
        (row) => row.id === food.id,
      ),
    ).toBe(true)
    expect(
      (
        await db
          .select({ total: count() })
          .from(foodCatalogEvents)
          .where(eq(foodCatalogEvents.foodId, food.id))
      )[0]?.total,
    ).toBeGreaterThan(3)
    expect(
      (
        await db
          .select({ total: count() })
          .from(platformAuditLogs)
          .where(
            and(
              eq(platformAuditLogs.entityId, food.id),
              eq(platformAuditLogs.action, 'food.published'),
            ),
          )
      )[0]?.total,
    ).toBe(1)
    await transitionPlatformFood(db, { ...actor, foodId: food.id, toStatus: 'archived' })
    expect(
      (await searchFoods(db, { query: `taslak mercimek ${actor.suffix}` })).some(
        (row) => row.id === food.id,
      ),
    ).toBe(false)
    expect(
      (
        await db
          .select({ total: count() })
          .from(foodCatalogEvents)
          .where(eq(foodCatalogEvents.foodId, food.id))
      )[0]?.total,
    ).toBeGreaterThan(4)
  })

  it('validates recipe scope/ingredients, calculates coverage and preserves history', async () => {
    const actor = await fixture(),
      foodA = await readyFood(actor, 'Food A', [100, 10, 20, 5, 3]),
      foodB = await readyFood(actor, 'Food B', [50, 4, 8, 2, 0])
    const draft = await createPlatformFood(db, { ...actor, nameTr: `Draft Food ${actor.suffix}` })
    const recipe = await createPlatformRecipe(db, {
      ...actor,
      nameTr: `Golden Tarif ${actor.suffix}`,
      servings: 3,
      totalYieldGrams: 600,
      cookingMethod: 'test-method',
    })
    const [portionA] = await db
        .select()
        .from(foodPortions)
        .where(eq(foodPortions.foodId, foodA.id))
        .limit(1),
      [portionB] = await db
        .select()
        .from(foodPortions)
        .where(eq(foodPortions.foodId, foodB.id))
        .limit(1)
    await expect(
      replacePlatformRecipeIngredients(db, {
        ...actor,
        recipeId: recipe.id,
        ingredients: [{ foodId: foodA.id, amountGrams: 200, portionId: portionB!.id }],
      }),
    ).rejects.toMatchObject({ code: 'portion_mismatch' })
    await expect(
      replacePlatformRecipeIngredients(db, {
        ...actor,
        recipeId: recipe.id,
        ingredients: [{ foodId: draft.id, amountGrams: 100 }],
      }),
    ).rejects.toMatchObject({ code: 'food_not_eligible' })
    await replacePlatformRecipeIngredients(db, {
      ...actor,
      recipeId: recipe.id,
      ingredients: [
        { foodId: foodA.id, amountGrams: 200, portionId: portionA!.id },
        { foodId: foodB.id, amountGrams: 100 },
      ],
    })
    let detail = await getRecipeForPlatform(db, recipe.id)
    expect(detail?.calculation?.nutrients.PROCNT?.total).toBeCloseTo(24)
    expect(detail?.calculation?.nutrients.PROCNT?.per100g).toBeCloseTo(4)
    expect(detail?.calculation?.nutrients.PROCNT?.perServing).toBeCloseTo(8)
    expect(detail?.cookingWarning).toContain('retention factor bulunamadı')
    await addPlatformRecipeReference(db, {
      ...actor,
      recipeId: recipe.id,
      title: 'Tarif kaynağı',
      citation: 'Test mutfağı',
    })
    await transitionPlatformRecipe(db, { ...actor, recipeId: recipe.id, toStatus: 'in_review' })
    await expect(
      transitionPlatformRecipe(db, {
        ...actor,
        platformStaffId: 'missing-staff',
        recipeId: recipe.id,
        toStatus: 'published',
      }),
    ).rejects.toBeTruthy()
    expect((await getRecipeForPlatform(db, recipe.id))?.editorialStatus).toBe('in_review')
    await transitionPlatformRecipe(db, { ...actor, recipeId: recipe.id, toStatus: 'published' })
    detail = await getRecipeForPlatform(db, recipe.id)
    expect(detail?.isPublic).toBe(true)
    expect(detail?.editorialStatus).toBe('published')
    await expect(
      transitionPlatformFood(db, { ...actor, foodId: foodA.id, toStatus: 'archived' }),
    ).rejects.toMatchObject({ code: 'published_recipe_dependency' })
    await transitionPlatformRecipe(db, { ...actor, recipeId: recipe.id, toStatus: 'archived' })
    expect(
      (
        await db
          .select({ total: count() })
          .from(recipeCatalogEvents)
          .where(eq(recipeCatalogEvents.recipeId, recipe.id))
      )[0]?.total,
    ).toBeGreaterThan(3)
    const [tenant] = await db
      .insert(recipes)
      .values({
        clinicId: `clinic-${actor.suffix}`,
        nameTr: 'Tenant tarif',
        isPlatformManaged: true,
      })
      .returning()
    expect(await getRecipeForPlatform(db, tenant!.id)).toBeNull()
  })
})

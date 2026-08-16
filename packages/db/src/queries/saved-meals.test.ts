import { createId } from '@paralleldrive/cuid2'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../client'

// GitHub issue #27 / Prompt 5.5, GÖREV 3 — öğün blokları kütüphanesi
// round-trip testleri. queries/plans.test.ts ile AYNI desen: gerçek bir
// Postgres'e ihtiyaç duyar, DATABASE_URL yoksa TAMAMEN atlanır (bkz. o
// dosyanın dosya başı notu — buradaki gerekçe birebir aynı).
const DATABASE_URL = process.env.DATABASE_URL
const describeWithDb = DATABASE_URL ? describe : describe.skip

describeWithDb('saved-meals query katmanı (round-trip, gerçek DB)', () => {
  let db: Database
  let clinicId: string
  let otherClinicId: string
  let userId: string

  beforeAll(async () => {
    const clientModule = await import('../client')
    db = clientModule.db
    const { clinics, users } = await import('../schema/tenancy')

    const suffix = createId()
    userId = createId()
    await db
      .insert(users)
      .values({ id: userId, email: `saved-meal-test-${suffix}@ogun.test`, name: 'Test Diyetisyen' })

    const [clinic] = await db
      .insert(clinics)
      .values({ name: 'Test Kliniği', slug: `saved-meal-klinik-${suffix}` })
      .returning()
    clinicId = clinic!.id

    const [otherClinic] = await db
      .insert(clinics)
      .values({ name: 'Diğer Klinik', slug: `saved-meal-diger-klinik-${suffix}` })
      .returning()
    otherClinicId = otherClinic!.id
  })

  afterAll(async () => {
    const { clinics, users } = await import('../schema/tenancy')
    const { eq } = await import('drizzle-orm')
    await db.delete(clinics).where(eq(clinics.id, clinicId))
    await db.delete(clinics).where(eq(clinics.id, otherClinicId))
    await db.delete(users).where(eq(users.id, userId))
    await db.$client.end()
  })

  it('createSavedMealFromMeal bir öğünün kalemlerini kopyalar, boş öğünü reddeder', async () => {
    const { createPlan, addDay, addMeal, addItem, deletePlan } = await import('./plans')
    const { createSavedMealFromMeal, deleteSavedMeal } = await import('./saved-meals')

    const plan = await createPlan(db, clinicId, userId, { name: 'Kaynak plan' })
    const day = await addDay(db, clinicId, plan.id, { dayNumber: 1 })
    const meal = await addMeal(db, clinicId, day.id, { mealType: 'kahvaltı', name: 'Kahvaltı' })

    // Boş öğün kaydedilemez.
    await expect(
      createSavedMealFromMeal(db, clinicId, userId, { mealId: meal.id, name: 'Boş öğün' }),
    ).rejects.toThrow()

    await addItem(db, clinicId, meal.id, { freeText: '2 yumurta', amount: 100, sortOrder: 0 })
    await addItem(db, clinicId, meal.id, { freeText: '1 dilim tam buğday ekmeği', amount: 30, sortOrder: 1 })

    const saved = await createSavedMealFromMeal(db, clinicId, userId, {
      mealId: meal.id,
      name: 'Standart kahvaltı',
      notes: 'protein ağırlıklı',
    })
    expect(saved.name).toBe('Standart kahvaltı')
    expect(saved.mealType).toBe('kahvaltı')

    await deleteSavedMeal(db, clinicId, saved.id)
    await deletePlan(db, clinicId, plan.id)
  })

  it('listSavedMeals doğru itemCount ile döner ve klinik bazlı izole eder', async () => {
    const { createPlan, addDay, addMeal, addItem, deletePlan } = await import('./plans')
    const { createSavedMealFromMeal, listSavedMeals, deleteSavedMeal } = await import(
      './saved-meals'
    )

    const plan = await createPlan(db, clinicId, userId, { name: 'Liste testi planı' })
    const day = await addDay(db, clinicId, plan.id, { dayNumber: 1 })
    const meal = await addMeal(db, clinicId, day.id, { mealType: 'ara1', name: 'Ara öğün' })
    await addItem(db, clinicId, meal.id, { freeText: '1 avuç badem', amount: 20, sortOrder: 0 })

    const saved = await createSavedMealFromMeal(db, clinicId, userId, {
      mealId: meal.id,
      name: 'Protein ağırlıklı ara öğün',
    })

    const listForClinic = await listSavedMeals(db, clinicId)
    const found = listForClinic.find((s) => s.id === saved.id)
    expect(found?.itemCount).toBe(1)

    const listForOtherClinic = await listSavedMeals(db, otherClinicId)
    expect(listForOtherClinic.some((s) => s.id === saved.id)).toBe(false)

    const listByMealType = await listSavedMeals(db, clinicId, 'ara1')
    expect(listByMealType.some((s) => s.id === saved.id)).toBe(true)
    const listByWrongMealType = await listSavedMeals(db, clinicId, 'akşam')
    expect(listByWrongMealType.some((s) => s.id === saved.id)).toBe(false)

    await deleteSavedMeal(db, clinicId, saved.id)
    await deletePlan(db, clinicId, plan.id)
  })

  it('insertSavedMealIntoMeal kayıtlı öğünü hedef öğüne KOPYALAR, mevcut kalemleri KORUR', async () => {
    const { createPlan, addDay, addMeal, addItem, getPlanTree, deletePlan } = await import(
      './plans'
    )
    const { createSavedMealFromMeal, insertSavedMealIntoMeal, deleteSavedMeal } = await import(
      './saved-meals'
    )

    // Kaynak plan: kayıtlı öğünün üretileceği öğün.
    const sourcePlan = await createPlan(db, clinicId, userId, { name: 'Kayıt kaynağı' })
    const sourceDay = await addDay(db, clinicId, sourcePlan.id, { dayNumber: 1 })
    const sourceMeal = await addMeal(db, clinicId, sourceDay.id, {
      mealType: 'kahvaltı',
      name: 'Kahvaltı',
    })
    await addItem(db, clinicId, sourceMeal.id, { freeText: '2 yumurta', amount: 100, sortOrder: 0 })
    await addItem(db, clinicId, sourceMeal.id, { freeText: 'Peynir', amount: 30, sortOrder: 1 })
    const saved = await createSavedMealFromMeal(db, clinicId, userId, {
      mealId: sourceMeal.id,
      name: 'Standart kahvaltı v2',
    })

    // Hedef plan: ZATEN bir kalemi olan farklı bir öğün.
    const targetPlan = await createPlan(db, clinicId, userId, { name: 'Hedef plan' })
    const targetDay = await addDay(db, clinicId, targetPlan.id, { dayNumber: 1 })
    const targetMeal = await addMeal(db, clinicId, targetDay.id, {
      mealType: 'kahvaltı',
      name: 'Kahvaltı',
    })
    await addItem(db, clinicId, targetMeal.id, { freeText: 'Zeytin', amount: 20, sortOrder: 0 })

    const inserted = await insertSavedMealIntoMeal(db, clinicId, targetMeal.id, saved.id)
    expect(inserted).toHaveLength(2)
    // sortOrder mevcut kalemin (Zeytin, sortOrder 0) ARDINDAN devam eder.
    expect(inserted.map((i) => i.sortOrder).sort()).toEqual([1, 2])

    const tree = await getPlanTree(db, clinicId, targetPlan.id)
    const items = tree?.days[0]?.meals[0]?.items.map((i) => i.item.freeText) ?? []
    expect(items).toEqual(['Zeytin', '2 yumurta', 'Peynir'])

    // Kaynak (saved_meal_items) DEĞİŞMEDİ — tekrar eklenebilir olmalı.
    const insertedAgain = await insertSavedMealIntoMeal(db, clinicId, targetMeal.id, saved.id)
    expect(insertedAgain).toHaveLength(2)

    await deleteSavedMeal(db, clinicId, saved.id)
    await deletePlan(db, clinicId, sourcePlan.id)
    await deletePlan(db, clinicId, targetPlan.id)
  })

  it('başka bir klinikten kayıtlı öğüne erişim/ekleme reddedilir (ClinicScope izolasyonu)', async () => {
    const { createPlan, addDay, addMeal, addItem, deletePlan } = await import('./plans')
    const { createSavedMealFromMeal, insertSavedMealIntoMeal, deleteSavedMeal } = await import(
      './saved-meals'
    )

    const plan = await createPlan(db, clinicId, userId, { name: 'İzolasyon planı' })
    const day = await addDay(db, clinicId, plan.id, { dayNumber: 1 })
    const meal = await addMeal(db, clinicId, day.id, { mealType: 'akşam', name: 'Akşam' })
    await addItem(db, clinicId, meal.id, { freeText: 'Izgara tavuk', amount: 150, sortOrder: 0 })
    const saved = await createSavedMealFromMeal(db, clinicId, userId, {
      mealId: meal.id,
      name: 'İzolasyon testi öğünü',
    })

    await expect(
      insertSavedMealIntoMeal(db, otherClinicId, meal.id, saved.id),
    ).rejects.toThrow()
    await expect(deleteSavedMeal(db, otherClinicId, saved.id)).rejects.toThrow()

    await deleteSavedMeal(db, clinicId, saved.id)
    await deletePlan(db, clinicId, plan.id)
  })
})

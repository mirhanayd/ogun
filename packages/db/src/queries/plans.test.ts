import { createId } from '@paralleldrive/cuid2'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../client'

// GitHub issue #23 / Prompt 5.1 — plan şeması round-trip testleri.
//
// BAĞLAM: bu paketteki diğer query testleri (bkz. client-health.test.ts)
// SADECE pure fonksiyonları test ediyor, gerçek bir DB'ye bağlanmıyor —
// çünkü '../client' modülü (bkz. client.ts) import edildiği anda
// DATABASE_URL zorunlu kılıyor. Bu dosya ise roadmap'in AÇIKÇA istediği
// "actions'ı doğrudan çağıran, UI'sız round-trip testleri" (bkz. issue #23
// gövdesi) için GERÇEK bir Postgres'e ihtiyaç duyuyor — packages/etl/src/
// e2e-plan-validation.ts'teki "DB'ye bağımlı doğrulama ayrı yaşar" deseniyle
// AYNI gerekçeyle, '../client' BİLEREK top-level import EDİLMEDİ, sadece
// DATABASE_URL set edildiğinde (beforeAll içinde) dinamik olarak yükleniyor.
// DATABASE_URL yoksa bu describe bloğu TAMAMEN atlanır (pnpm test hâlâ
// yeşil kalır) — CI/geliştirici DATABASE_URL vermeden `pnpm test`
// çalıştırdığında sessizce skip edilir.
//
// Çalıştırmak için (bkz. PR açıklaması): geçici, migrate edilmiş bir
// Postgres'e karşı `DATABASE_URL=postgresql://... pnpm --filter @ogun/db test`.
const DATABASE_URL = process.env.DATABASE_URL
const describeWithDb = DATABASE_URL ? describe : describe.skip

describeWithDb('plans query layer (round-trip, gerçek DB)', () => {
  let db: Database
  let clinicId: string
  let otherClinicId: string
  let userId: string
  let clientId: string

  beforeAll(async () => {
    const clientModule = await import('../client')
    db = clientModule.db
    const { clinics, users } = await import('../schema/tenancy')
    const { clients } = await import('../schema/clients')

    const suffix = createId()
    userId = createId()
    await db.insert(users).values({ id: userId, email: `test-${suffix}@ogun.test`, name: 'Test Diyetisyen' })

    const [clinic] = await db
      .insert(clinics)
      .values({ name: 'Test Kliniği', slug: `test-klinik-${suffix}` })
      .returning()
    clinicId = clinic!.id

    const [otherClinic] = await db
      .insert(clinics)
      .values({ name: 'Diğer Klinik', slug: `diger-klinik-${suffix}` })
      .returning()
    otherClinicId = otherClinic!.id

    const [client] = await db
      .insert(clients)
      .values({ clinicId, firstName: 'Ayşe', lastName: 'Yılmaz' })
      .returning()
    clientId = client!.id
  })

  afterAll(async () => {
    const { clinics, users } = await import('../schema/tenancy')
    const { clients } = await import('../schema/clients')
    const { eq } = await import('drizzle-orm')
    // plans/days/meals/items zaten deletePlan ile temizlendiği için burada
    // sadece fixture'ları (client/clinic/user) geri alıyoruz.
    await db.delete(clients).where(eq(clients.id, clientId))
    await db.delete(clinics).where(eq(clinics.id, clinicId))
    await db.delete(clinics).where(eq(clinics.id, otherClinicId))
    await db.delete(users).where(eq(users.id, userId))
    await db.$client.end()
  })

  it('createPlan -> updatePlan -> deletePlan tam döngüsü çalışır', async () => {
    const { createPlan, updatePlan, getPlanById, deletePlan } = await import('./plans')

    const created = await createPlan(db, clinicId, userId, {
      clientId,
      name: 'Kilo verme planı',
      targetKcal: 1600,
      planType: 'günlük',
    })
    expect(created.name).toBe('Kilo verme planı')
    expect(created.status).toBe('taslak')

    const updated = await updatePlan(db, clinicId, created.id, { status: 'aktif', targetKcal: 1500 })
    expect(updated?.status).toBe('aktif')
    expect(updated?.targetKcal).toBe(1500)

    const fetched = await getPlanById(db, clinicId, created.id)
    expect(fetched?.id).toBe(created.id)

    const deleted = await deletePlan(db, clinicId, created.id)
    expect(deleted?.id).toBe(created.id)

    const afterDelete = await getPlanById(db, clinicId, created.id)
    expect(afterDelete).toBeNull()
  })

  it('başka bir klinikten plana erişim/güncelleme reddedilir (ClinicScope izolasyonu)', async () => {
    const { createPlan, updatePlan, getPlanById, deletePlan } = await import('./plans')

    const created = await createPlan(db, clinicId, userId, { name: 'İzole plan' })

    const crossClinicRead = await getPlanById(db, otherClinicId, created.id)
    expect(crossClinicRead).toBeNull()

    const crossClinicUpdate = await updatePlan(db, otherClinicId, created.id, { name: 'Ele geçirilmiş' })
    expect(crossClinicUpdate).toBeNull()

    await deletePlan(db, clinicId, created.id)
  })

  it('plan_items CHECK kısıtı: foodId/recipeId/freeText tam olarak biri dolu olmalı', async () => {
    const { createPlan, addDay, addMeal, addItem, deletePlan } = await import('./plans')

    const plan = await createPlan(db, clinicId, userId, { name: 'Kısıt testi planı' })
    const day = await addDay(db, clinicId, plan.id, { dayNumber: 1 })
    const meal = await addMeal(db, clinicId, day.id, { mealType: 'kahvaltı', name: 'Kahvaltı' })

    // Geçerli: sadece freeText dolu.
    const item = await addItem(db, clinicId, meal.id, { freeText: '1 avuç kuruyemiş', amount: 30 })
    expect(item.freeText).toBe('1 avuç kuruyemiş')

    // Geçersiz: ikisi birden dolu (foodId + freeText) — hem uygulama
    // katmanı (assertExactlyOneSource) hem DB CHECK kısıtı reddetmeli.
    await expect(
      addItem(db, clinicId, meal.id, { foodId: 'nonexistent-food-id', freeText: 'ikisi birden', amount: 10 }),
    ).rejects.toThrow()

    // Geçersiz: hiçbiri dolu değil.
    await expect(addItem(db, clinicId, meal.id, { amount: 10 })).rejects.toThrow()

    await deletePlan(db, clinicId, plan.id)
  })

  it('addItem -> reorderItems kalemleri istenen sırayla sortOrder\'a yazar', async () => {
    const { createPlan, addDay, addMeal, addItem, reorderItems, deletePlan } = await import('./plans')

    const plan = await createPlan(db, clinicId, userId, { name: 'Sıralama planı' })
    const day = await addDay(db, clinicId, plan.id, { dayNumber: 1 })
    const meal = await addMeal(db, clinicId, day.id, { mealType: 'öğle', name: 'Öğle' })

    const first = await addItem(db, clinicId, meal.id, { freeText: 'A', amount: 100, sortOrder: 0 })
    const second = await addItem(db, clinicId, meal.id, { freeText: 'B', amount: 100, sortOrder: 1 })
    const third = await addItem(db, clinicId, meal.id, { freeText: 'C', amount: 100, sortOrder: 2 })

    const reordered = await reorderItems(db, clinicId, meal.id, [third.id, first.id, second.id])
    const byId = new Map(reordered.map((item) => [item.id, item.sortOrder]))
    expect(byId.get(third.id)).toBe(0)
    expect(byId.get(first.id)).toBe(1)
    expect(byId.get(second.id)).toBe(2)

    await deletePlan(db, clinicId, plan.id)
  })

  it('addAlternative bir kaleme "veya" alternatifi ekler ve removeItem alternatifleri de siler', async () => {
    const { createPlan, addDay, addMeal, addItem, addAlternative, removeItem, deletePlan } = await import('./plans')

    const plan = await createPlan(db, clinicId, userId, { name: 'Alternatif planı' })
    const day = await addDay(db, clinicId, plan.id, { dayNumber: 1 })
    const meal = await addMeal(db, clinicId, day.id, { mealType: 'akşam', name: 'Akşam' })
    const item = await addItem(db, clinicId, meal.id, { freeText: 'Tavuk göğsü', amount: 150 })

    const alternative = await addAlternative(db, clinicId, item.id, { freeText: 'Hindi göğsü', amount: 150 })
    expect(alternative.itemId).toBe(item.id)

    const removed = await removeItem(db, clinicId, item.id)
    expect(removed?.id).toBe(item.id)

    await deletePlan(db, clinicId, plan.id)
  })

  it('clonePlan (ve duplicatePlan) plan + gün + öğün + kalem + alternatifi derin kopyalar', async () => {
    const { createPlan, addDay, addMeal, addItem, addAlternative, clonePlan, duplicatePlan, getPlanTree, deletePlan } =
      await import('./plans')

    const source = await createPlan(db, clinicId, userId, {
      clientId,
      name: 'Kaynak plan',
      targetKcal: 1800,
      notes: 'Kaynak notu',
    })
    const day1 = await addDay(db, clinicId, source.id, { dayNumber: 1, dayLabel: 'Pazartesi' })
    const breakfast = await addMeal(db, clinicId, day1.id, { mealType: 'kahvaltı', name: 'Kahvaltı', sortOrder: 0 })
    const item1 = await addItem(db, clinicId, breakfast.id, { freeText: '2 yumurta', amount: 100, sortOrder: 0 })
    await addAlternative(db, clinicId, item1.id, { freeText: '1 kase yoğurt', amount: 200, sortOrder: 0 })

    const day2 = await addDay(db, clinicId, source.id, { dayNumber: 2, dayLabel: 'Salı' })
    await addMeal(db, clinicId, day2.id, { mealType: 'öğle', name: 'Öğle', sortOrder: 0 })

    // --- clonePlan: farklı bir hedef danışana kopyala -----------------------
    const cloned = await clonePlan(db, clinicId, userId, source.id, null)
    expect(cloned.id).not.toBe(source.id)
    expect(cloned.clientId).toBeNull() // targetClientId=null -> şablonsuz kopya
    expect(cloned.name).toBe('Kaynak plan (kopya)')
    expect(cloned.targetKcal).toBe(1800)
    // computedTotals BİLİNÇLİ olarak taşınmaz (bkz. clonePlanInternal notu).
    expect(cloned.computedTotals).toBeNull()

    const clonedTree = await getPlanTree(db, clinicId, cloned.id)
    expect(clonedTree?.days).toHaveLength(2)
    const clonedDay1 = clonedTree?.days.find((d) => d.day.dayLabel === 'Pazartesi')
    expect(clonedDay1?.day.id).not.toBe(day1.id)
    expect(clonedDay1?.meals).toHaveLength(1)
    const clonedItem = clonedDay1?.meals[0]?.items[0]
    expect(clonedItem?.item.id).not.toBe(item1.id)
    expect(clonedItem?.item.freeText).toBe('2 yumurta')
    expect(clonedItem?.alternatives).toHaveLength(1)
    expect(clonedItem?.alternatives[0]?.freeText).toBe('1 kase yoğurt')

    // --- duplicatePlan: aynı danışan için bir kopya --------------------------
    const duplicated = await duplicatePlan(db, clinicId, userId, source.id)
    expect(duplicated.clientId).toBe(clientId) // kaynağın clientId'si korunur
    expect(duplicated.name).toBe('Kaynak plan (kopya)')

    await deletePlan(db, clinicId, source.id)
    await deletePlan(db, clinicId, cloned.id)
    await deletePlan(db, clinicId, duplicated.id)
  })

  it('saveAsTemplate şablon alanlarını set eder ve isTemplate=true olur', async () => {
    const { createPlan, saveAsTemplate, listPlans, deletePlan } = await import('./plans')

    const source = await createPlan(db, clinicId, userId, { clientId, name: 'Diyabet planı v1' })
    const template = await saveAsTemplate(db, clinicId, userId, source.id, 'diyabet', 'Diyabet Şablonu')

    expect(template.isTemplate).toBe(true)
    expect(template.templateCategory).toBe('diyabet')
    expect(template.clientId).toBeNull()
    expect(template.status).toBe('taslak')

    const templates = await listPlans(db, clinicId, { isTemplate: true, templateCategory: 'diyabet' })
    expect(templates.some((t) => t.id === template.id)).toBe(true)

    await deletePlan(db, clinicId, source.id)
    await deletePlan(db, clinicId, template.id)
  })
})

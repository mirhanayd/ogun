import { createId } from '@paralleldrive/cuid2'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../client'

// GitHub issue #24 / Prompt 5.2 GÖREV 1 — food_usage round-trip testleri.
// plans.test.ts (issue #23) ile AYNI gerekçe/desen: bu, gerçek bir Postgres'e
// ihtiyaç duyar, '../client' top-level import EDİLMEZ (DATABASE_URL yoksa
// import anında patlar), DATABASE_URL yoksa describe TAMAMEN atlanır.
//
// Çalıştırmak için: geçici, migrate edilmiş bir Postgres'e karşı
// `DATABASE_URL=postgresql://... pnpm --filter @ogun/db test`.
const DATABASE_URL = process.env.DATABASE_URL
const describeWithDb = DATABASE_URL ? describe : describe.skip

describeWithDb('food usage query layer (round-trip, gerçek DB)', () => {
  let db: Database
  let clinicId: string
  let otherClinicId: string
  let foodIdA: string
  let foodIdB: string
  let dataSourceId: string

  beforeAll(async () => {
    const clientModule = await import('../client')
    db = clientModule.db
    const { clinics } = await import('../schema/tenancy')
    const { dataSources, foods } = await import('../schema/foods')

    const suffix = createId()

    const [clinic] = await db
      .insert(clinics)
      .values({ name: 'Test Kliniği', slug: `test-klinik-food-usage-${suffix}` })
      .returning()
    clinicId = clinic!.id

    const [otherClinic] = await db
      .insert(clinics)
      .values({ name: 'Diğer Klinik', slug: `diger-klinik-food-usage-${suffix}` })
      .returning()
    otherClinicId = otherClinic!.id

    const [dataSource] = await db
      .insert(dataSources)
      .values({ code: 'CUSTOM', name: `Test Kaynağı ${suffix}`, priority: 1 })
      .onConflictDoNothing({ target: dataSources.code })
      .returning()
    dataSourceId = dataSource?.id ?? (await db.select().from(dataSources).limit(1))[0]!.id

    const [foodA] = await db
      .insert(foods)
      .values({
        sourceId: dataSourceId,
        sourceCode: `test-a-${suffix}`,
        nameTr: 'Test Mercimek Çorbası',
        searchText: 'test mercimek corbasi',
      })
      .returning()
    foodIdA = foodA!.id

    const [foodB] = await db
      .insert(foods)
      .values({
        sourceId: dataSourceId,
        sourceCode: `test-b-${suffix}`,
        nameTr: 'Test Tavuk Göğsü',
        searchText: 'test tavuk gogsu',
      })
      .returning()
    foodIdB = foodB!.id
  })

  afterAll(async () => {
    const { clinics } = await import('../schema/tenancy')
    const { foods } = await import('../schema/foods')
    const { eq } = await import('drizzle-orm')
    const { clearFoodUsageForClinic } = await import('./food-usage')

    await clearFoodUsageForClinic(db, clinicId)
    await clearFoodUsageForClinic(db, otherClinicId)
    await db.delete(foods).where(eq(foods.id, foodIdA))
    await db.delete(foods).where(eq(foods.id, foodIdB))
    await db.delete(clinics).where(eq(clinics.id, clinicId))
    await db.delete(clinics).where(eq(clinics.id, otherClinicId))
    await db.$client.end()
  })

  it('recordFoodUsage aynı (clinic, food) çifti için sayaç artırır, satır çoğaltmaz', async () => {
    const { recordFoodUsage } = await import('./food-usage')

    await recordFoodUsage(db, clinicId, foodIdA)
    await recordFoodUsage(db, clinicId, foodIdA)
    await recordFoodUsage(db, clinicId, foodIdA)

    const { getPinnedFoodUsage } = await import('./food-usage')
    const pinned = await getPinnedFoodUsage(db, clinicId)
    const rowA = pinned.find((row) => row.foodId === foodIdA)

    expect(rowA).toBeDefined()
    expect(rowA?.useCount).toBe(3)
  })

  it('getPinnedFoodUsage sadece kendi kliniğinin kayıtlarını döner', async () => {
    const { recordFoodUsage, getPinnedFoodUsage } = await import('./food-usage')

    await recordFoodUsage(db, otherClinicId, foodIdB)

    const ownPinned = await getPinnedFoodUsage(db, clinicId)
    const otherPinned = await getPinnedFoodUsage(db, otherClinicId)

    expect(ownPinned.some((row) => row.foodId === foodIdB)).toBe(false)
    expect(otherPinned.some((row) => row.foodId === foodIdB)).toBe(true)
  })

  it('getPinnedFoodUsage en son kullanılanı önce sıralar', async () => {
    const { recordFoodUsage, getPinnedFoodUsage } = await import('./food-usage')

    await recordFoodUsage(db, clinicId, foodIdB)

    const pinned = await getPinnedFoodUsage(db, clinicId)
    expect(pinned[0]?.foodId).toBe(foodIdB)
  })
})

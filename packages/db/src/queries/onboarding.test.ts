import { createId } from '@paralleldrive/cuid2'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../client'

// GitHub issue #47 / Prompt 8.3, GÖREV 1 + GÖREV 3 — "örnek plan oluştur"
// (onboarding.ts) VE CSV içe aktarmanın rıza davranışı (bulkImportClients/
// confirmClientConsent, clients.ts) round-trip testleri.
const DATABASE_URL = process.env.DATABASE_URL
const describeWithDb = DATABASE_URL ? describe : describe.skip

describeWithDb('onboarding + toplu içe aktarma query katmanı (round-trip, gerçek DB)', () => {
  let db: Database
  let clinicId: string
  let userId: string

  beforeAll(async () => {
    const clientModule = await import('../client')
    db = clientModule.db
    const { clinics, users } = await import('../schema/tenancy')

    const suffix = createId()
    const [clinic] = await db
      .insert(clinics)
      .values({ name: 'Test Kliniği Onboarding', slug: `test-klinik-onboarding-${suffix}` })
      .returning()
    clinicId = clinic!.id

    const [user] = await db
      .insert(users)
      .values({ email: `test-onboarding-${suffix}@ornek.com`, name: 'Test Diyetisyen' })
      .returning()
    userId = user!.id
  })

  afterAll(async () => {
    const { clinics, users } = await import('../schema/tenancy')
    const { clients } = await import('../schema/clients')
    const { measurements } = await import('../schema/measurements')
    const { dietPlans, planDays, planItems, planMeals } = await import('../schema/plans')
    const { eq, inArray } = await import('drizzle-orm')

    const clinicClients = await db.select({ id: clients.id }).from(clients).where(eq(clients.clinicId, clinicId))
    const clientIds = clinicClients.map((c) => c.id)
    if (clientIds.length > 0) {
      await db.delete(measurements).where(inArray(measurements.clientId, clientIds))
    }

    const plans = await db.select({ id: dietPlans.id }).from(dietPlans).where(eq(dietPlans.clinicId, clinicId))
    const planIds = plans.map((p) => p.id)
    if (planIds.length > 0) {
      const days = await db.select({ id: planDays.id }).from(planDays).where(inArray(planDays.planId, planIds))
      const dayIds = days.map((d) => d.id)
      if (dayIds.length > 0) {
        const meals = await db.select({ id: planMeals.id }).from(planMeals).where(inArray(planMeals.dayId, dayIds))
        const mealIds = meals.map((m) => m.id)
        if (mealIds.length > 0) {
          await db.delete(planItems).where(inArray(planItems.mealId, mealIds))
          await db.delete(planMeals).where(inArray(planMeals.id, mealIds))
        }
        await db.delete(planDays).where(inArray(planDays.id, dayIds))
      }
      await db.delete(dietPlans).where(inArray(dietPlans.id, planIds))
    }

    if (clientIds.length > 0) {
      await db.delete(clients).where(inArray(clients.id, clientIds))
    }
    await db.delete(clinics).where(eq(clinics.id, clinicId))
    await db.delete(users).where(eq(users.id, userId))
    await db.$client.end()
  })

  it('createSampleClientAndPlan bir örnek danışan + AYNI menüyle bir örnek plan üretir', async () => {
    const { createSampleClientAndPlan } = await import('./onboarding')
    const { dietPlans, planMeals, planDays } = await import('../schema/plans')
    const { eq } = await import('drizzle-orm')

    const result = await createSampleClientAndPlan(db, clinicId, userId)
    expect(result.clientId).toBeTruthy()
    expect(result.planId).toBeTruthy()

    const [plan] = await db.select().from(dietPlans).where(eq(dietPlans.id, result.planId))
    expect(plan?.clientId).toBe(result.clientId)
    expect(plan?.status).toBe('taslak')

    const [day] = await db.select().from(planDays).where(eq(planDays.planId, result.planId))
    const meals = await db.select().from(planMeals).where(eq(planMeals.dayId, day!.id))
    // sample-plan-template.ts'teki 5 öğün (kahvaltı/ara1/öğle/ara2/akşam).
    expect(meals).toHaveLength(5)
  })

  it('createSamplePlanForClient var olan bir danışan için TEK bir örnek plan ekler (yeni danışan OLUŞTURMAZ)', async () => {
    const { createSampleClientAndPlan, createSamplePlanForClient } = await import('./onboarding')
    const { dietPlans } = await import('../schema/plans')
    const { eq } = await import('drizzle-orm')

    const first = await createSampleClientAndPlan(db, clinicId, userId)
    const secondPlan = await createSamplePlanForClient(db, clinicId, userId, first.clientId)

    expect(secondPlan.clientId).toBe(first.clientId)

    const clientPlans = await db.select().from(dietPlans).where(eq(dietPlans.clientId, first.clientId))
    expect(clientPlans).toHaveLength(2)
  })

  it('bulkImportClients rıza ONAYLANMAMIŞSA (consentAt=null) danışanı "rıza bekliyor" durumunda oluşturur', async () => {
    const { bulkImportClients, confirmClientConsent } = await import('./clients')

    const inserted = await bulkImportClients(db, clinicId, userId, [
      {
        firstName: 'Ayşe',
        lastName: 'İçeAktarım',
        phone: null,
        birthDate: null,
        sex: null,
        consentAt: null,
        consentVersion: null,
        weightHistory: [],
      },
    ])
    expect(inserted).toHaveLength(1)

    const { clients } = await import('../schema/clients')
    const { eq } = await import('drizzle-orm')
    const [row] = await db.select().from(clients).where(eq(clients.id, inserted[0]!.id))
    // GERÇEK invaryant testi: assertClientConsentComplete'in tek kayıt
    // akışında GEREKTİRDİĞİ rıza tarihleri burada BİLEREK null — bu, bulk
    // importClients'in invaryantı SESSİZCE atlamadığının kanıtı (bkz.
    // clients.ts bulkImportClients dosya başı notu).
    expect(row?.kvkkConsentAt).toBeNull()
    expect(row?.explicitConsentAt).toBeNull()

    // confirmClientConsent ile SONRADAN tamamlanabilmeli.
    const confirmed = await confirmClientConsent(db, clinicId, inserted[0]!.id, '2026-01')
    expect(confirmed?.kvkkConsentAt).not.toBeNull()
    expect(confirmed?.explicitConsentAt).not.toBeNull()

    await db.delete(clients).where(eq(clients.id, inserted[0]!.id))
  })

  it('bulkImportClients rıza ONAYLANMIŞSA consentAt/version ile birlikte kilo geçmişini de measurements\'a yazar', async () => {
    const { bulkImportClients } = await import('./clients')
    const { measurements } = await import('../schema/measurements')
    const { clients } = await import('../schema/clients')
    const { eq } = await import('drizzle-orm')

    const now = new Date()
    const inserted = await bulkImportClients(db, clinicId, userId, [
      {
        firstName: 'Mehmet',
        lastName: 'İçeAktarım',
        phone: '0532 000 00 00',
        birthDate: '1990-01-01',
        sex: 'male',
        consentAt: now,
        consentVersion: '2026-01',
        weightHistory: [
          { measuredAt: new Date('2024-01-01'), weightKg: 90.5 },
          { measuredAt: new Date('2024-06-01'), weightKg: 85.2 },
        ],
      },
    ])

    const [row] = await db.select().from(clients).where(eq(clients.id, inserted[0]!.id))
    expect(row?.kvkkConsentAt).not.toBeNull()
    expect(row?.kvkkConsentVersion).toBe('2026-01')

    const weightRows = await db.select().from(measurements).where(eq(measurements.clientId, inserted[0]!.id))
    expect(weightRows).toHaveLength(2)

    await db.delete(measurements).where(eq(measurements.clientId, inserted[0]!.id))
    await db.delete(clients).where(eq(clients.id, inserted[0]!.id))
  })
})

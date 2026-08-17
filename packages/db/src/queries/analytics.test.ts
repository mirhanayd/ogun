import { createId } from '@paralleldrive/cuid2'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../client'

// GitHub issue #47 / Prompt 8.3, GÖREV 2 + GÖREV 4 — usage_events/
// food_search_logs round-trip testleri. food-usage.test.ts (issue #24)
// ile AYNI desen (gerçek DB, DATABASE_URL yoksa describe.skip).
//
// Çalıştırmak için: DATABASE_URL=postgresql://... pnpm --filter @ogun/db test
const DATABASE_URL = process.env.DATABASE_URL
const describeWithDb = DATABASE_URL ? describe : describe.skip

describeWithDb('analytics query layer (round-trip, gerçek DB)', () => {
  let db: Database
  let clinicId: string

  beforeAll(async () => {
    const clientModule = await import('../client')
    db = clientModule.db
    const { clinics } = await import('../schema/tenancy')

    const suffix = createId()
    const [clinic] = await db
      .insert(clinics)
      .values({
        name: 'Test Kliniği Analytics',
        slug: `test-klinik-analytics-${suffix}`,
        onboardingCompletedAt: new Date(),
      })
      .returning()
    clinicId = clinic!.id
  })

  afterAll(async () => {
    const { clinics } = await import('../schema/tenancy')
    const { usageEvents, foodSearchLogs } = await import('../schema/analytics')
    const { eq } = await import('drizzle-orm')

    await db.delete(usageEvents).where(eq(usageEvents.clinicId, clinicId))
    await db.delete(foodSearchLogs).where(eq(foodSearchLogs.clinicId, clinicId))
    await db.delete(clinics).where(eq(clinics.id, clinicId))
    await db.$client.end()
  })

  it('logUsageEvent bir plan_created olayını kaydeder, averagePlanCreationDurationMs ortalamayı hesaplar', async () => {
    const { logUsageEvent, averagePlanCreationDurationMs } = await import('./analytics')

    await logUsageEvent(db, { clinicId, userId: null, eventName: 'plan_created', durationMs: 1000 })
    await logUsageEvent(db, { clinicId, userId: null, eventName: 'plan_created', durationMs: 3000 })
    // Farklı bir olay adı ortalamaya KARIŞMAMALI.
    await logUsageEvent(db, { clinicId, userId: null, eventName: 'screen_view', durationMs: 99999 })

    const average = await averagePlanCreationDurationMs(db)
    expect(average).toBe(2000)
  })

  it('logFoodSearchQuery ile kaydedilen aramalar mostSearchedFoodQueries\'de sonuç>0 olanlar arasında görünür', async () => {
    const { logFoodSearchQuery, mostSearchedFoodQueries } = await import('./analytics')

    const uniqueQuery = `mercimek-corbasi-${createId()}`
    await logFoodSearchQuery(db, { clinicId, query: uniqueQuery, normalizedQuery: uniqueQuery, resultCount: 5 })
    await logFoodSearchQuery(db, { clinicId, query: uniqueQuery, normalizedQuery: uniqueQuery, resultCount: 3 })

    const results = await mostSearchedFoodQueries(db, 100)
    const match = results.find((r) => r.normalizedQuery === uniqueQuery)
    expect(match).toBeDefined()
    expect(match?.count).toBe(2)
  })

  it('GÖREV 4 — sıfır sonuçlu bir arama zeroResultFoodQueries\'de görünür, sonuçlu aramalar ORADA görünmez', async () => {
    const { logFoodSearchQuery, zeroResultFoodQueries, mostSearchedFoodQueries } = await import('./analytics')

    const missingFoodQuery = `mantarli-kokorec-${createId()}`
    await logFoodSearchQuery(db, {
      clinicId,
      query: missingFoodQuery,
      normalizedQuery: missingFoodQuery,
      resultCount: 0,
    })
    await logFoodSearchQuery(db, {
      clinicId,
      query: missingFoodQuery,
      normalizedQuery: missingFoodQuery,
      resultCount: 0,
    })

    const zeroResults = await zeroResultFoodQueries(db, 100)
    const match = zeroResults.find((r) => r.normalizedQuery === missingFoodQuery)
    expect(match).toBeDefined()
    expect(match?.count).toBe(2)

    // Sıfır sonuçlu bir sorgu "en çok aranan" (sonuçlu) listesine SIZMAMALI —
    // aksi halde diyetisyene "bu besin popüler" gibi yanlış bir sinyal
    // verilir, oysa aslında veri tabanında hiç YOK.
    const mostSearched = await mostSearchedFoodQueries(db, 100)
    expect(mostSearched.some((r) => r.normalizedQuery === missingFoodQuery)).toBe(false)
  })

  it('getPilotMetrics tüm metrikleri tek çağrıda döner', async () => {
    const { getPilotMetrics } = await import('./analytics')
    const metrics = await getPilotMetrics(db)

    expect(metrics.activeClinicCount).toBeGreaterThanOrEqual(1)
    expect(metrics.plansCreatedCount).toBeGreaterThanOrEqual(0)
    expect(Array.isArray(metrics.mostSearchedFoods)).toBe(true)
    expect(Array.isArray(metrics.zeroResultSearches)).toBe(true)
  })

  it('createFeedbackReport bir geri bildirim kaydı oluşturur', async () => {
    const { createFeedbackReport } = await import('./analytics')
    const { users } = await import('../schema/tenancy')

    const [user] = await db
      .insert(users)
      .values({ email: `test-feedback-${createId()}@ornek.com`, name: 'Test Kullanıcı' })
      .returning()

    const report = await createFeedbackReport(db, {
      clinicId,
      userId: user!.id,
      page: '/danisanlar',
      message: 'Buton çalışmıyor.',
      consoleLog: '[ERROR] örnek log',
      screenshotDataUrl: null,
    })

    expect(report.id).toBeTruthy()
    expect(report.message).toBe('Buton çalışmıyor.')

    // Temizlik: feedback_reports FK'leri (clinic_id/user_id) CASCADE
    // DEĞİL — önce raporu, sonra kullanıcıyı sil (aksi halde afterAll'daki
    // clinic silme işlemi FK ihlaliyle patlar).
    const { eq } = await import('drizzle-orm')
    const { feedbackReports } = await import('../schema/analytics')
    await db.delete(feedbackReports).where(eq(feedbackReports.id, report.id))
    await db.delete(users).where(eq(users.id, user!.id))
  })
})

// GitHub issue #47 / Prompt 8.3, GÖREV 2 + GÖREV 4 — kullanım analitiği
// (usageEvents), besin arama günlüğü (foodSearchLogs, GÖREV 4'ün en kritik
// metriği "sıfır sonuçlu aramalar" bunun üzerine kurulu) ve pilot ölçüm
// paneli sorguları. Bu dosyadaki HİÇBİR fonksiyon danışan/sağlık verisine
// dokunmaz (bkz. schema/analytics.ts dosya başı notu) — bu yüzden diğer
// query dosyalarının aksine clinicId zorunlu bir ClinicScope parametresi
// DEĞİL (usageEvents.clinicId nullable — ör. /giris ekranı için).
import { and, count, desc, eq, gte, sql } from 'drizzle-orm'
import { clinics } from '../schema/tenancy'
import { dietPlans } from '../schema/plans'
import { feedbackReports, foodSearchLogs, usageEvents } from '../schema/analytics'
import type { Database } from '../client'

// --- Kullanım olayları (GÖREV 2) --------------------------------------------

export interface LogUsageEventInput {
  clinicId: string | null
  userId: string | null
  eventName: string
  screen?: string | null
  durationMs?: number | null
}

export async function logUsageEvent(db: Database, input: LogUsageEventInput): Promise<void> {
  await db.insert(usageEvents).values({
    clinicId: input.clinicId,
    userId: input.userId,
    eventName: input.eventName,
    screen: input.screen ?? null,
    durationMs: input.durationMs ?? null,
  })
}

// --- Besin arama günlüğü (GÖREV 4) ------------------------------------------

export interface LogFoodSearchInput {
  clinicId: string
  query: string
  normalizedQuery: string
  resultCount: number
}

export async function logFoodSearchQuery(db: Database, input: LogFoodSearchInput): Promise<void> {
  await db.insert(foodSearchLogs).values({
    clinicId: input.clinicId,
    query: input.query,
    normalizedQuery: input.normalizedQuery,
    resultCount: input.resultCount,
  })
}

// --- Geri bildirim (GÖREV 2) ------------------------------------------------

export interface CreateFeedbackReportInput {
  clinicId: string
  userId: string
  page: string
  message: string
  consoleLog?: string | null
  screenshotDataUrl?: string | null
}

export async function createFeedbackReport(db: Database, input: CreateFeedbackReportInput) {
  const [row] = await db
    .insert(feedbackReports)
    .values({
      clinicId: input.clinicId,
      userId: input.userId,
      page: input.page,
      message: input.message,
      consoleLog: input.consoleLog ?? null,
      screenshotDataUrl: input.screenshotDataUrl ?? null,
    })
    .returning()
  if (!row) throw new Error('Geri bildirim kaydedilemedi.')
  return row
}

// --- Pilot ölçüm paneli (GÖREV 4) -------------------------------------------
//
// Bu sorgular BİLEREK klinik-bazlı değil, PLATFORM GENELİNDE (tüm kliniklere
// bakan) toplu sayımlar — "iç kullanım için" bir pilot izleme paneli,
// diyetisyenin normal iş akışının bir parçası DEĞİL. Bu yüzden
// authz.ts'teki ClinicScope deseninin (her sorgu bir clinicId ile
// filtrelenir) DIŞINDA kalıyorlar — çağıran taraf (apps/web/.../panel/pilot)
// erişimi bir e-posta allowlist'iyle (PILOT_METRICS_ACCESS_EMAILS) sınırlar,
// clinic-scoped bir rol kontrolüyle DEĞİL, çünkü bu veriler zaten TEK bir
// kliniğe ait değil.

export async function countActiveClinics(db: Database): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(clinics)
    .where(sql`${clinics.onboardingCompletedAt} is not null`)
  return row?.value ?? 0
}

export async function countPlansCreated(db: Database): Promise<number> {
  const [row] = await db.select({ value: count() }).from(dietPlans)
  return row?.value ?? 0
}

// Plan oluşturma süresi ("ortalama plan oluşturma süresi") — plan editörü
// tarafında GÖREV 2'nin "plan oluşturma süresi" olayı olarak zaten loglanıyor
// (eventName='plan_created', bkz. apps/web/.../new-plan-button.tsx). Burada
// SADECE o olayların ortalaması alınıyor, süre hesabı BURADA yeniden
// YAPILMIYOR.
export async function averagePlanCreationDurationMs(db: Database): Promise<number | null> {
  const [row] = await db
    .select({ value: sql<string | null>`avg(${usageEvents.durationMs})` })
    .from(usageEvents)
    .where(eq(usageEvents.eventName, 'plan_created'))
  if (!row?.value) return null
  return Math.round(Number(row.value))
}

export interface FoodSearchAggregate {
  normalizedQuery: string
  sampleQuery: string
  count: number
}

// "En çok aranan besinler" — sonuç DÖNEN aramalar arasından.
export async function mostSearchedFoodQueries(db: Database, limit = 20): Promise<FoodSearchAggregate[]> {
  const rows = await db
    .select({
      normalizedQuery: foodSearchLogs.normalizedQuery,
      sampleQuery: sql<string>`max(${foodSearchLogs.query})`,
      count: count(),
    })
    .from(foodSearchLogs)
    .where(sql`${foodSearchLogs.resultCount} > 0`)
    .groupBy(foodSearchLogs.normalizedQuery)
    .orderBy(desc(count()))
    .limit(limit)
  return rows
}

// GÖREV 4'ün EN KRİTİK metriği: "hangi Türk yemeklerinin veri tabanında
// eksik olduğunu bize söyleyecek". resultCount = 0 olan aramaların, en sık
// tekrar edilenden başlayarak listesi.
export async function zeroResultFoodQueries(db: Database, limit = 50): Promise<FoodSearchAggregate[]> {
  const rows = await db
    .select({
      normalizedQuery: foodSearchLogs.normalizedQuery,
      sampleQuery: sql<string>`max(${foodSearchLogs.query})`,
      count: count(),
    })
    .from(foodSearchLogs)
    .where(eq(foodSearchLogs.resultCount, 0))
    .groupBy(foodSearchLogs.normalizedQuery)
    .orderBy(desc(count()))
    .limit(limit)
  return rows
}

export interface PilotMetrics {
  activeClinicCount: number
  plansCreatedCount: number
  averagePlanCreationDurationMs: number | null
  mostSearchedFoods: FoodSearchAggregate[]
  zeroResultSearches: FoodSearchAggregate[]
}

export async function getPilotMetrics(db: Database): Promise<PilotMetrics> {
  const [activeClinicCount, plansCreatedCount, averagePlanCreationDurationMsValue, mostSearchedFoods, zeroResultSearches] =
    await Promise.all([
      countActiveClinics(db),
      countPlansCreated(db),
      averagePlanCreationDurationMs(db),
      mostSearchedFoodQueries(db),
      zeroResultFoodQueries(db),
    ])
  return {
    activeClinicCount,
    plansCreatedCount,
    averagePlanCreationDurationMs: averagePlanCreationDurationMsValue,
    mostSearchedFoods,
    zeroResultSearches,
  }
}

// GÖREV 2 — "hangi ekranda ne kadar süre" özet görünümü (pilot panelinde
// ekstra bir bağlam, spesifik olarak istenmedi ama var olan usageEvents
// verisini ölçüm panelinde israf etmemek için eklendi).
export interface ScreenTimeAggregate {
  screen: string
  visitCount: number
  averageDurationMs: number | null
}

export async function averageScreenTime(db: Database, since?: Date): Promise<ScreenTimeAggregate[]> {
  const conditions = [eq(usageEvents.eventName, 'screen_view')]
  if (since) conditions.push(gte(usageEvents.createdAt, since))

  const rows = await db
    .select({
      screen: usageEvents.screen,
      visitCount: count(),
      averageDurationMs: sql<string | null>`avg(${usageEvents.durationMs})`,
    })
    .from(usageEvents)
    .where(and(...conditions))
    .groupBy(usageEvents.screen)
    .orderBy(desc(count()))

  return rows
    .filter((row): row is typeof row & { screen: string } => row.screen !== null)
    .map((row) => ({
      screen: row.screen,
      visitCount: row.visitCount,
      averageDurationMs: row.averageDurationMs ? Math.round(Number(row.averageDurationMs)) : null,
    }))
}

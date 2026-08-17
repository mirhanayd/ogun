// GitHub issue #47 / Prompt 8.3, GÖREV 1 — "Boş durumlarda 'örnek plan
// oluştur' butonu". Bu dosya packages/db/src/seed/demo.ts'in (GitHub #45)
// TAMAMINI çağırmaz — o script bir bütün sahte klinik + 2 diyetisyen + 25
// danışan + randevular üretir, GERÇEK bir yeni kullanıcının boş hesabına
// koymak için UYGUNSUZ. Burada SADECE demo.ts'in menü içeriğini (bkz.
// seed/sample-plan-template.ts) yeniden kullanan, TEK bir örnek danışan +
// TEK bir örnek plan üreten iki dar fonksiyon var.
import { eq } from 'drizzle-orm'
import { clients } from '../schema/clients'
import { dietPlans, planDays, planItems, planMeals } from '../schema/plans'
import { users } from '../schema/tenancy'
import {
  SAMPLE_PLAN_GENERAL_INSTRUCTIONS,
  SAMPLE_PLAN_MEAL_TEMPLATES,
  SAMPLE_PLAN_TARGET_KCAL,
  SAMPLE_PLAN_TARGET_MACROS,
} from '../seed/sample-plan-template'
import type { Database } from '../client'

const SAMPLE_PLAN_NAME = 'Örnek Plan'

// --- 4 adımlı ürün turu (GÖREV 1) -------------------------------------------

export async function hasCompletedProductTour(db: Database, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ productTourCompletedAt: users.productTourCompletedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  return row?.productTourCompletedAt !== null && row?.productTourCompletedAt !== undefined
}

export async function markProductTourCompleted(db: Database, userId: string): Promise<void> {
  await db.update(users).set({ productTourCompletedAt: new Date() }).where(eq(users.id, userId))
}

// db.transaction()'ın callback'ine geçirilen `tx` parametresinin tipi
// `Database`'in KENDİSİ değil (transaction nesnesinde .transaction() yok) —
// bu yüzden çıkarım yoluyla (infer) gerçek tx tipini alıyoruz, `as unknown as
// Database` gibi güvensiz bir cast YERİNE (bkz. queries/plans.ts
// createPlanSkeleton'daki AYNI transaction kullanımı — orası tx'i doğrudan,
// tip çıkarımıyla kullanıyor, burada iki fonksiyona bölündüğü için tipin adı
// gerekiyor).
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

async function insertSamplePlanForClient(
  tx: Tx,
  clinicId: string,
  createdBy: string,
  clientId: string,
) {
  const [plan] = await tx
    .insert(dietPlans)
    .values({
      clinicId,
      clientId,
      name: SAMPLE_PLAN_NAME,
      targetKcal: SAMPLE_PLAN_TARGET_KCAL,
      targetMacros: SAMPLE_PLAN_TARGET_MACROS,
      planType: 'günlük',
      status: 'taslak',
      createdBy,
      generalInstructions: SAMPLE_PLAN_GENERAL_INSTRUCTIONS,
    })
    .returning()
  if (!plan) throw new Error('Örnek plan oluşturulamadı.')

  const [day] = await tx.insert(planDays).values({ planId: plan.id, dayNumber: 1 }).returning()
  if (!day) throw new Error('Örnek plan günü oluşturulamadı.')

  for (const [mealIndex, mealTemplate] of SAMPLE_PLAN_MEAL_TEMPLATES.entries()) {
    const [meal] = await tx
      .insert(planMeals)
      .values({
        dayId: day.id,
        mealType: mealTemplate.mealType,
        time: mealTemplate.time,
        name: mealTemplate.name,
        sortOrder: mealIndex,
      })
      .returning()
    if (!meal) throw new Error('Örnek öğün oluşturulamadı.')

    for (const [itemIndex, itemText] of mealTemplate.items.entries()) {
      await tx.insert(planItems).values({
        mealId: meal.id,
        freeText: itemText,
        amount: '1.00',
        sortOrder: itemIndex,
      })
    }
  }

  return plan
}

// Zaten var olan bir danışan için örnek plan (bkz. planlar-tab.tsx'teki
// "Henüz plan yok" boş durumu — clientId zaten bilindiğinden yeni bir
// danışan oluşturmaya gerek yok).
export async function createSamplePlanForClient(
  db: Database,
  clinicId: string,
  createdBy: string,
  clientId: string,
) {
  return db.transaction((tx) => insertSamplePlanForClient(tx, clinicId, createdBy, clientId))
}

export interface SampleClientAndPlan {
  clientId: string
  planId: string
}

// Klinikte HİÇ danışan yokken (danışan listesi boş durumu) — hem örnek bir
// danışan hem de o danışan için örnek bir plan üretir. Örnek danışan GERÇEK
// bir kişi değil, klinik SAHİBİNİN kendi hesabında bıraktığı bir demo kaydı
// olduğu için (silinebilir/düzenlenebilir, notes alanında bu açıkça
// belirtiliyor) rıza tarihleri "şimdi" olarak set edilir — assertClientConsentComplete
// invaryantını atlamıyoruz, sadece bu sentetik kayıt için rızayı klinik
// sahibinin KENDİSİ (bu butonu tıklayan kullanıcı) veriyor sayılır.
export async function createSampleClientAndPlan(
  db: Database,
  clinicId: string,
  createdBy: string,
): Promise<SampleClientAndPlan> {
  return db.transaction(async (tx) => {
    const now = new Date()
    const [client] = await tx
      .insert(clients)
      .values({
        clinicId,
        firstName: 'Örnek',
        lastName: 'Danışan',
        sex: 'female',
        status: 'aktif',
        notes: 'Bu, "örnek plan oluştur" ile üretilen bir gösterim kaydıdır — silebilir veya düzenleyebilirsiniz.',
        kvkkConsentAt: now,
        kvkkConsentVersion: 'ornek-kayit',
        explicitConsentAt: now,
      })
      .returning()
    if (!client) throw new Error('Örnek danışan oluşturulamadı.')

    const plan = await insertSamplePlanForClient(tx, clinicId, createdBy, client.id)
    return { clientId: client.id, planId: plan.id }
  })
}

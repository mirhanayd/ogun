import { randomBytes } from 'node:crypto'
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { dietPlans } from '../schema/plans'
import { planShares, planShareSends, type PlanShareSendChannel } from '../schema/plan-shares'
import type { Database } from '../client'

// GitHub issue #36 / Prompt 6.2 — plan_shares/plan_share_sends sorgu katmanı.
// plans.ts'teki assertPlanInClinic ile AYNI "önce clinic doğrula" deseni
// (bkz. o dosyanın başı notu) — plan_shares'in kendi clinicId sütunu YOK,
// planId -> dietPlans.clinicId zincirinden doğrulanır.
//
// BÖLÜM AYRIMI (dosyanın geri kalanında da korunuyor):
//  - "Kimlikli" fonksiyonlar bir clinicId ALIR, apps/web tarafında ClinicScope
//    ile sarmalanır (withAuth), link üretme/iptal/gönderim kaydı buraya girer.
//  - "Public" fonksiyonlar (bkz. dosya sonu) clinicId ALMAZ — /p/[token]
//    rotasının kimliksiz erişimi için, BİLEREK dar bir sütun kümesi döner
//    (asla client/health tablolarına JOIN yapmaz, bkz. dosya başı uyarı).

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

// Bir share satırının, verilen klinikteki bir plana GERÇEKTEN ait olduğunu
// doğrular — getItemWithClinicCheck (plans.ts) ile AYNI "join ile doğrula"
// deseni.
async function getShareWithClinicCheck(db: Database, clinicId: string, shareId: string) {
  const [row] = await db
    .select({ share: planShares, plan: dietPlans })
    .from(planShares)
    .innerJoin(dietPlans, eq(dietPlans.id, planShares.planId))
    .where(and(eq(planShares.id, shareId), eq(dietPlans.clinicId, clinicId)))
    .limit(1)
  return row ?? null
}

// Rastgele, tahmin edilemez token — 32 bayt (256 bit) kriptografik rastgelelik,
// URL-safe base64url kodlaması (queries/documents.ts'teki crypto.randomUUID
// TABANLI storageKey'lerden FARKLI olarak: UUID v4 sadece 122 bit rastgele
// bit taşır ve burada asıl erişim kontrolü token'ın KENDİSİ olduğu için daha
// yüksek bir entropi bilinçli olarak tercih edildi, bkz. schema notu).
export function generateShareToken(): string {
  return randomBytes(32).toString('base64url')
}

const DEFAULT_SHARE_TTL_DAYS = 30

function isShareActive(share: { revokedAt: Date | null; expiresAt: Date | null }): boolean {
  if (share.revokedAt) return false
  if (share.expiresAt && share.expiresAt.getTime() <= Date.now()) return false
  return true
}

// GÖREV 1: paylaşım linki. Aynı plan için tekrar tekrar "link oluştur"a
// basıldığında YENİ bir token ÜRETMEK yerine (danışana zaten gönderilmiş
// eski linki anlamsız kılardı) hala aktif bir link varsa AYNI satır
// döndürülür — sadece süresi geçmiş/iptal edilmiş bir link varsa yenisi
// açılır.
export async function createOrReuseShare(
  db: Database,
  clinicId: string,
  planId: string,
  createdBy: string,
) {
  await assertPlanInClinic(db, clinicId, planId)

  const existing = await db
    .select()
    .from(planShares)
    .where(eq(planShares.planId, planId))
    .orderBy(desc(planShares.createdAt))
    .limit(1)
  const latest = existing[0]
  if (latest && isShareActive(latest)) {
    return latest
  }

  const expiresAt = new Date(Date.now() + DEFAULT_SHARE_TTL_DAYS * 24 * 60 * 60 * 1000)
  const [share] = await db
    .insert(planShares)
    .values({ planId, token: generateShareToken(), expiresAt, createdBy })
    .returning()
  if (!share) throw new Error('Paylaşım linki oluşturulamadı.')
  return share
}

// GÖREV 1: "Diyetisyen linki iptal edebilsin".
export async function revokeShare(db: Database, clinicId: string, shareId: string) {
  const found = await getShareWithClinicCheck(db, clinicId, shareId)
  if (!found) throw new Error('Paylaşım linki bulunamadı.')

  const [share] = await db
    .update(planShares)
    .set({ revokedAt: new Date() })
    .where(eq(planShares.id, shareId))
    .returning()
  return share ?? null
}

// Plan detay/editör ekranının "mevcut linki göster" bölümü için — en son
// üretilen share satırı (aktif olmasa da, "daha önce gönderilmiş ama şimdi
// süresi dolmuş" durumunu da göstermek için).
export async function getLatestShareForPlan(db: Database, clinicId: string, planId: string) {
  await assertPlanInClinic(db, clinicId, planId)
  const [share] = await db
    .select()
    .from(planShares)
    .where(eq(planShares.planId, planId))
    .orderBy(desc(planShares.createdAt))
    .limit(1)
  return share ?? null
}

// GÖREV 4: "gönderildi / görüntülendi / görüntülenmedi" göstergesinin
// çekirdek mantığı — tek bir planın en güncel share'inden türetilir.
export type PlanShareStatus = 'not_shared' | 'sent' | 'viewed'

export function derivePlanShareStatus(
  share: { viewedAt: Date | null } | null,
  hasSendRecord: boolean,
): PlanShareStatus {
  if (!share) return 'not_shared'
  if (share.viewedAt) return 'viewed'
  if (hasSendRecord) return 'sent'
  return 'not_shared'
}

// planlar-tab.tsx'in liste görünümü İÇİN toplu (N+1 sorgu YAPMADAN) durum
// haritası — bir klinikteki TÜM planların en güncel share'ini VE en az bir
// gönderim kaydı olup olmadığını tek turda çeker.
export async function getShareStatusesForPlans(
  db: Database,
  clinicId: string,
  planIds: string[],
): Promise<Map<string, PlanShareStatus>> {
  const result = new Map<string, PlanShareStatus>()
  if (planIds.length === 0) return result

  const shares = await db
    .select({ share: planShares })
    .from(planShares)
    .innerJoin(dietPlans, eq(dietPlans.id, planShares.planId))
    .where(and(inArray(planShares.planId, planIds), eq(dietPlans.clinicId, clinicId)))
    .orderBy(desc(planShares.createdAt))

  // Her plan için sadece EN GÜNCEL share'i tut (shares zaten createdAt DESC
  // sıralı geldiği için ilk görülen satır yeterli).
  const latestByPlan = new Map<string, typeof planShares.$inferSelect>()
  for (const { share } of shares) {
    if (!latestByPlan.has(share.planId)) latestByPlan.set(share.planId, share)
  }
  if (latestByPlan.size === 0) return result

  const shareIds = [...latestByPlan.values()].map((s) => s.id)
  const sendRows = await db
    .select({ shareId: planShareSends.shareId })
    .from(planShareSends)
    .where(inArray(planShareSends.shareId, shareIds))
  const shareIdsWithSend = new Set(sendRows.map((r) => r.shareId))

  for (const [planId, share] of latestByPlan) {
    result.set(planId, derivePlanShareStatus(share, shareIdsWithSend.has(share.id)))
  }
  return result
}

// GÖREV 2/3: WhatsApp/e-posta "gönder" eylemi tetiklendiğinde bir niyet/
// teyit kaydı (bkz. schema notu — WhatsApp için teyit değil niyet, e-posta
// için gerçek gönderim denemesi).
export async function recordShareSend(
  db: Database,
  clinicId: string,
  shareId: string,
  input: { channel: PlanShareSendChannel; recipient?: string | null; sentBy: string },
) {
  const found = await getShareWithClinicCheck(db, clinicId, shareId)
  if (!found) throw new Error('Paylaşım linki bulunamadı.')

  const [send] = await db
    .insert(planShareSends)
    .values({
      shareId,
      channel: input.channel,
      recipient: input.recipient ?? null,
      sentBy: input.sentBy,
    })
    .returning()
  if (!send) throw new Error('Gönderim kaydedilemedi.')
  return send
}

// ---------------------------------------------------------------------------
// PUBLIC — /p/[token] rotası, clinicId/auth GEREKTİRMEZ. bkz. dosya başı
// uyarısı: BURADAN client/health-records tablolarına ASLA JOIN yapılmaz.
// ---------------------------------------------------------------------------

export type PublicShareLookup =
  | { status: 'not_found' }
  | { status: 'revoked' }
  | { status: 'expired' }
  | { status: 'active'; clinicId: string; planId: string; shareId: string }

// Token'dan planı (ve planın ait olduğu clinicId'yi — SADECE
// resolvePlanPdfData'yı çağırabilmek için, bkz. apps/web/p/[token]/page.tsx)
// bulur. Dönen şekil BİLEREK dar: plan_shares + dietPlans'ın SADECE id/
// clinicId sütunları — hiçbir client/health alanı buraya SIZMAZ, gerçek plan
// İÇERİĞİ ayrıca resolvePlanPdfData (packages/pdf'in TEK, zaten sağlık
// verisi taşımayan PdfPlanData şekli) üzerinden çözülür.
export async function getPublicShareByToken(db: Database, token: string): Promise<PublicShareLookup> {
  const [row] = await db
    .select({
      shareId: planShares.id,
      revokedAt: planShares.revokedAt,
      expiresAt: planShares.expiresAt,
      planId: dietPlans.id,
      clinicId: dietPlans.clinicId,
    })
    .from(planShares)
    .innerJoin(dietPlans, eq(dietPlans.id, planShares.planId))
    .where(eq(planShares.token, token))
    .limit(1)

  if (!row) return { status: 'not_found' }
  if (row.revokedAt) return { status: 'revoked' }
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return { status: 'expired' }
  return { status: 'active', clinicId: row.clinicId, planId: row.planId, shareId: row.shareId }
}

// GÖREV 4: "danışan planı AÇTI MI" — public sayfa her yüklendiğinde çağrılır.
// viewedAt SADECE ilk görüntülemede set edilir (COALESCE), viewCount HER
// görüntülemede artar. revokedAt dolu bir satırda ÇAĞRILMAZ (çağıran taraf
// zaten 'active' durumunu önceden kontrol eder, bkz. page.tsx) — yine de bu
// fonksiyon WHERE koşuluyla revoked satırları güncellemez, çift güvence.
export async function recordPublicShareView(db: Database, shareId: string): Promise<void> {
  await db
    .update(planShares)
    .set({
      viewCount: sql`${planShares.viewCount} + 1`,
      viewedAt: sql`COALESCE(${planShares.viewedAt}, now())`,
    })
    .where(and(eq(planShares.id, shareId), isNull(planShares.revokedAt)))
}

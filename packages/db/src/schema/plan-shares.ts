// Plan paylaşım linki + gönderim izi — plan_shares, plan_share_sends.
// GitHub issue #36 / Prompt 6.2 ("Danışana ulaştırma").
//
// BAĞLAM: bu şema, #35'in (PDF üretimi) devrettiği yeri tam olarak alıyor —
// packages/pdf/src/render.tsx dosya başı notu "renderPlanPdfBuffer... #36
// (paylaşım linki) bunu devralabilsin" diyordu. Burada YENİ bir PDF üretim
// yolu YOK, sadece VAR OLAN plana (dietPlans) bağlı, tahmin edilemez bir
// token ile kimliksiz erişim izni tutuluyor.
//
// clinicId burada YOK — health-records.ts'teki lab_results/documents ile
// AYNI indirekt-scoping deseni (bkz. o dosyanın başı notu): plan_shares.planId
// -> dietPlans.clinicId zincirinden doğrulanır (bkz.
// packages/db/src/queries/plan-shares.ts assertPlanInClinic kullanımı).
// Token bir kez üretildiğinde, GÖRÜNTÜLEME rotası (/p/[token]) auth
// GEREKTİRMEZ (roadmap'in kendi metni: "auth gerektirmeyen, mobil öncelikli
// plan görüntüleme sayfası") — ama link ÜRETMEK/İPTAL ETMEK, tüm diğer
// danışan-verisi mutasyonları gibi withAuth+withAudit+ClinicScope zincirinden
// geçer (bkz. apps/web/.../share-actions.ts). Bu iki "auth" seviyesi
// KASITLI olarak ayrı: token'ın KENDİSİ zaten yeterince rastgele/tahmin
// edilemez olduğu için görüntüleme bir "bilgiyle kimliklenme" (possession-based
// auth) modeli kullanıyor — klasik kullanıcı/parola değil.
import { index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { dietPlans } from './plans'
import { users } from './tenancy'
import { id, timestamps } from './_helpers'

// --- plan_shares --------------------------------------------------------------

export const planShares = pgTable(
  'plan_shares',
  {
    id: id(),
    planId: text('plan_id')
      .notNull()
      .references(() => dietPlans.id),
    // Rastgele, tahmin edilemez — node:crypto randomBytes tabanlı (bkz.
    // queries/plan-shares.ts generateShareToken). URL-safe base64url, 32
    // bayt (256 bit) entropi — bir UUID/cuid2'den ÖNEMLİ ÖLÇÜDE daha yüksek
        // entropi, çünkü bu token'ın KENDİSİ tek erişim kontrolü (bkz. dosya
    // başı notu, "possession-based auth").
    token: text('token').notNull(),
    // NULL = süresiz. queries/plan-shares.ts createOrReuseShare
    // varsayılan olarak 30 gün ayarlıyor (bkz. o dosyadaki not) — roadmap
    // metni bir süre DAYATMIYOR, sadece sütunun VAR OLMASINI istiyor; 30 gün
    // makul bir güvenlik/gizlilik varsayılanı, kesin süre ürün sahibinin
    // kararına açık (dataRetentionDays'teki "kesin süre ayrıca belirlenecek"
    // notuyla AYNI temkinli yaklaşım).
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    // İlk görüntülemede set edilir, sonraki görüntülemelerde DEĞİŞMEZ —
    // "danışan planı AÇTI MI" sorusunun cevabı (GÖREV 4), "en son ne zaman
    // açtı" değil.
    viewedAt: timestamp('viewed_at', { withTimezone: true }),
    viewCount: integer('view_count').notNull().default(0),
    // Diyetisyen linki iptal ettiğinde set edilir (GÖREV 1, "Diyetisyen
    // linki iptal edebilsin"). Satırı SİLMİYORUZ — iptal edilmiş bir linke
    // gelen ziyaretçiye "süresi doldu/iptal edildi" durumu göstermek için
    // (bkz. /p/[token]/page.tsx) satırın kendisi hala lazım.
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdBy: text('created_by').references(() => users.id),
    ...timestamps(),
  },
  (table) => [
    // Public /p/[token] rotasının TEK sorgu deseni — token ile bulma, ayrıca
    // benzersizlik de bu indeksle garanti edilir (çakışma pratikte imkansız
    // ama DB seviyesinde de kapatılmalı, bkz. queries/plan-shares.ts'teki
        // "çakışırsa yeniden dene" notu YOK, çünkü unique index zaten var).
    uniqueIndex('plan_shares_token_idx').on(table.token),
    // Bir planın aktif linkini bulmak (createOrReuseShare) / plan listesinde
    // gönderim durumu göstergesi (GÖREV 4) için.
    index('plan_shares_plan_id_idx').on(table.planId),
  ],
)

// --- plan_share_sends -----------------------------------------------------------

// GÖREV 4'ün "sentVia/sentAt plan_shares'e mi, ayrı mı?" açık sorusu (bkz.
// PR açıklaması): AYRI bir tabloya karar verildi. Gerekçe: bir link birden
// FAZLA kanaldan (önce WhatsApp, sonra e-posta) gönderilebilir/yeniden
// gönderilebilir — plan_shares üzerinde tek bir sentVia/sentAt sütunu SADECE
// SON gönderimi tutabilirdi, "kaç kez ve hangi kanallardan gönderildi"
// sorusu geriye dönük CEVAPLANAMAZ olurdu (templateUsageCount sütunundaki
// "sayaç mı, ayrı tablo mu" kararıyla TERS yönde bir karar — orada tekil bir
// sayı yeterliydi, burada KANAL+ZAMAN geçmişi asıl istenen bilgi).
export const planShareSendChannelEnum = pgEnum('plan_share_send_channel', ['whatsapp', 'email'])
export type PlanShareSendChannel = (typeof planShareSendChannelEnum.enumValues)[number]

export const planShareSends = pgTable(
  'plan_share_sends',
  {
    id: id(),
    shareId: text('share_id')
      .notNull()
      .references(() => planShares.id),
    channel: planShareSendChannelEnum('channel').notNull(),
    // WhatsApp için: wa.me linki bir tarayıcı sekmesinde AÇILIR, gerçek
    // gönderim istemci cihazında gerçekleşir — sunucu bunu asla teyit
    // edemez (v1'in "API'ye gerek yok" kararının doğal sonucu, bkz. roadmap
    // GÖREV 2). Bu yüzden bu satır "gönderim TEYİDİ" değil, "diyetisyen
    // gönder butonuna bastı" niyet kaydı — e-posta içinse GERÇEK bir
    // sunucu-taraflı gönderim denemesi (bkz. share-actions.ts).
    recipient: text('recipient'), // e-posta adresi veya telefon numarası (varsa)
    sentBy: text('sent_by').references(() => users.id),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Plan listesindeki "gönderildi" göstergesi (GÖREV 4) — bir share'in HİÇ
    // gönderim kaydı olup olmadığını sormak için shareId'ye göre.
    index('plan_share_sends_share_id_idx').on(table.shareId),
  ],
)

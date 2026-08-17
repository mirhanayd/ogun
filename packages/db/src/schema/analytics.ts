// Pilot hazırlığı — kullanım analitiği + besin arama günlüğü + geri bildirim.
// GitHub issue #47 / Prompt 8.3.
//
// GÖREV 2'nin ÖNEMLİ kısıtı: "analitik aracına sağlık verisi göndermeyin,
// sadece olay adları". Bu üç tablo (usageEvents, foodSearchLogs,
// feedbackReports) BİLEREK dar bir şekilde tasarlandı — hiçbirinde danışan
// kimliği/sağlık verisi taşıyan bir alan YOK. usageEvents sadece bir olay adı
// + hangi ekran + kaç ms sürdü tutar; foodSearchLogs sadece yazılan arama
// metnini (bir besin adı arama sorgusu, bkz. #24'ün offline besin arama
// motoru — client-health verisi DEĞİL) + kaç sonuç döndüğünü tutar;
// feedbackReports bir metin + konsol logu + ekran görüntüsü tutar ama
// BUNLARIN İÇİNE danışan verisi girip girmediği uygulama tarafında
// KONTROL EDİLEMEZ (serbest metin) — bu yüzden apps/web/src/lib/monitoring/
// pii-scrub.ts'teki AYNI kırpma motoru feedback mesajı/konsol logu üzerinde
// de (server action seviyesinde) çalıştırılır, bkz. o dosyanın
// scrubPiiFromText'i ve apps/web/.../feedback/actions.ts.
import { index, integer, jsonb, pgTable, text } from 'drizzle-orm/pg-core'
import { clinics, users } from './tenancy'
import { id, timestamps } from './_helpers'

// GÖREV 2 — "hangi ekranda ne kadar süre, plan oluşturma süresi". `screen`
// bir ROUTE adı/etiketi (ör. "/planlar/[planId]"), asla bir danışan adı
// içermez (bkz. apps/web/src/lib/analytics/track.ts — trackEvent'in tip
// imzası zaten serbest metin ALMAZ, sadece sabit bir eventName + isteğe
// bağlı screen/durationMs kabul eder, bu yüzden çağıran taraf yanlışlıkla
// bir danışan objesi geçiremez).
export const usageEvents = pgTable(
  'usage_events',
  {
    id: id(),
    // Kliniksiz bir olay da olabilir (ör. /giris sayfasında geçirilen süre) —
    // bu yüzden clinicId NULLABLE, foods/clients tablolarındaki notNull
    // clinicId kuralından BİLEREK farklı (bu tablo danışan verisine
    // dokunmuyor, ClinicScope zorunluluğu KVKK gerekçesiyle değil sadece
    // "hangi klinik" bilgisi için var).
    clinicId: text('clinic_id').references(() => clinics.id),
    userId: text('user_id').references(() => users.id),
    eventName: text('event_name').notNull(),
    screen: text('screen'),
    durationMs: integer('duration_ms'),
    ...timestamps(),
  },
  (table) => [index('usage_events_clinic_id_idx').on(table.clinicId), index('usage_events_event_name_idx').on(table.eventName)],
)

// GÖREV 4'ün en kritik metriği — "arama sonucu bulunamayan sorgular... hangi
// Türk yemeklerinin veri tabanında eksik olduğunu bize söyleyecek". Sadece
// bir arama METNİ (besin adı sorgusu) + kaç sonuç döndüğü. clinicId burada da
// nullable DEĞİL çünkü besin araması her zaman aktif bir klinik bağlamında
// (plan editörü/komut paleti) yapılır — requireClinic() zaten bunu garanti
// eder (bkz. apps/web/src/app/api/analytics/food-search/route.ts).
export const foodSearchLogs = pgTable(
  'food_search_logs',
  {
    id: id(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    query: text('query').notNull(),
    // normalize edilmiş sorgu (bkz. lib/normalize.ts normalizeSearchText) —
    // "en çok aranan"/"sıfır sonuçlu" gruplamaları BÜYÜK/KÜÇÜK harf VEYA
    // Türkçe karakter varyasyonlarına göre yanlış bölünmesin diye ayrıca
    // tutulur (ör. "Künefe" ile "künefe" aynı satırda toplanabilsin).
    normalizedQuery: text('normalized_query').notNull(),
    resultCount: integer('result_count').notNull(),
    ...timestamps(),
  },
  (table) => [
    index('food_search_logs_clinic_id_idx').on(table.clinicId),
    index('food_search_logs_normalized_query_idx').on(table.normalizedQuery),
    index('food_search_logs_result_count_idx').on(table.resultCount),
  ],
)

// GÖREV 2 — "Uygulama içi geri bildirim butonu (ekran görüntüsü + konsol
// logu ekli)". screenshotDataUrl bir data: URI (istemcide canvas'a çizilip
// sıkıştırılmış JPEG, bkz. feedback-dialog.tsx) — S3/obje depolama bu
// issue'nun kapsamı DIŞINDA (pilot ölçeğinde birkaç düzine geri bildirim,
// ayrı bir depolama altyapısı gerektirmiyor), text kolonunda saklanıyor.
// consoleLog SON N konsol satırının (bkz. lib/monitoring/console-buffer.ts)
// tek bir metne birleştirilmiş hali.
export const feedbackReports = pgTable(
  'feedback_reports',
  {
    id: id(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    page: text('page').notNull(),
    message: text('message').notNull(),
    consoleLog: text('console_log'),
    screenshotDataUrl: text('screenshot_data_url'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    ...timestamps(),
  },
  (table) => [index('feedback_reports_clinic_id_idx').on(table.clinicId)],
)

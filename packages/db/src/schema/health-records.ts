// Laboratuvar sonuçları ve dosya/belge yönetimi — lab_results, documents.
// GitHub issue #19 / Prompt 4.3, GÖREV 2 + GÖREV 3.
//
// clients.ts'teki clientHealth ve measurements.ts'teki measurements/
// clientGoals ile AYNI desen (bkz. o dosyaların dosya başı notu): bu iki
// tabloda da doğrudan bir clinicId sütunu YOK — clinicId, clientId
// üzerinden clients tablosuna JOIN edilerek doğrulanır (bkz.
// packages/db/src/queries/lab-results.ts, queries/documents.ts). Roadmap
// metninin (Prompt 4.3) documents için düz metinde "id, clinicId, clientId,
// ..." yazması BİLEREK burada UYGULANMADI — görev sahibinin açık talimatı,
// #18'in indirekt-scoping desenini burada da sürdürmek ve clientId'den
// türetilebilecek bir clinicId sütununu TEKRAR depolamamak (normalizasyon,
// authz.ts'teki ClinicScope kuralının ihlali DEĞİL — o kural her sorgunun
// clinicId'siz YAZILAMAMASI, sütunun NEREDE tutulduğu değil).
import { index, integer, pgEnum, pgTable, text, timestamp, numeric } from 'drizzle-orm/pg-core'
import { clients } from './clients'
import { users } from './tenancy'
import { id, timestamps } from './_helpers'

// --- Laboratuvar sonuçları (GÖREV 2) ----------------------------------------
//
// analyte BİLEREK bir pgEnum DEĞİL, serbest metin: roadmap'in "sık kullanılan
// analitler için hazır liste" istediği preset'ler (bkz.
// packages/nutrition-core/src/lab-analytes.ts LAB_ANALYTE_PRESETS) sadece
// formu hızlı doldurmak için bir UI kolaylığı — diyetisyen preset dışı bir
// analit de girebilmeli (kapalı bir enum bunu engellerdi).
//
// isAbnormal roadmap metninde "(hesaplanır)" notuyla verildi — measurements.ts
// dosya başı notundaki BKİ/bel-kalça oranı ile AYNI kural: hesaplanan alanlar
// kolon DEĞİL, sorgu katmanında value/refMin/refMax'tan türetilir (bkz.
// nutrition-core computeLabAbnormalStatus, queries/lab-results.ts).
export const labResults = pgTable(
  'lab_results',
  {
    id: id(),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id),
    // Tahlilin YAPILDIĞI an — kayıt anı DEĞİL (createdAt zaten onu tutuyor).
    // measurements.measuredAt ile AYNI gerekçe: diyetisyen geçmiş bir tahlili
    // geriye dönük girebilir, zaman serisi grafiği bu alana göre sıralanır.
    testedAt: timestamp('tested_at', { withTimezone: true }).notNull().defaultNow(),
    analyte: text('analyte').notNull(),
    // numeric — foods.ts/measurements.ts ile AYNI desen (drizzle-orm 0.38
    // numeric mode:'number' desteklemiyor, sorgu katmanı Number() ile çevirir).
    value: numeric('value', { precision: 10, scale: 3 }).notNull(),
    unit: text('unit').notNull(),
    refMin: numeric('ref_min', { precision: 10, scale: 3 }),
    refMax: numeric('ref_max', { precision: 10, scale: 3 }),
    labName: text('lab_name'),
    notes: text('notes'),
    recordedBy: text('recorded_by').references(() => users.id),
    ...timestamps(),
  },
  (table) => [
    // Bir danışanın tahlil geçmişini (zaman serisi grafiği) en yeniden en
    // eskiye çekmek — measurements ile AYNI en sık sorgu deseni.
    index('lab_results_client_id_tested_at_idx').on(table.clientId, table.testedAt.desc()),
    // Tek bir analitin (ör. sadece "hba1c") zaman serisi grafiği için —
    // grafik ekranı önce analit seçtirip sonra o analitin geçmişini çizer.
    index('lab_results_client_id_analyte_idx').on(table.clientId, table.analyte),
  ],
)

// --- Dosya / belge yönetimi (GÖREV 3) ---------------------------------------

// Roadmap GÖREV 3'te bire bir bu şekilde (Türkçe) verildi — clients.ts
// clientStatusEnum üstündeki notla AYNI gerekçe: ürünün kendi domain
// terimleri, diyetisyenin göreceği kategori etiketiyle DB değeri aynı.
export const documentCategoryEnum = pgEnum('document_category', [
  'tahlil',
  'reçete',
  'bia_çıktısı',
  'fotoğraf',
  'diğer',
])
export type DocumentCategory = (typeof documentCategoryEnum.enumValues)[number]

// storageKey — S3 uyumlu depolamadaki (yerel: MinIO, üretim: Cloudflare
// R2/S3, bkz. apps/web/src/lib/storage.ts) nesne anahtarı. Dosyanın KENDİSİ
// burada YOK, sadece bir referans — "dosyalar asla public olmasın" kuralı
// (roadmap GÖREV 3) presigned URL akışıyla apps/web tarafında sağlanır, bu
// tablo bunu bilmez/zorlamaz.
export const documents = pgTable(
  'documents',
  {
    id: id(),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id),
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    storageKey: text('storage_key').notNull().unique(),
    category: documentCategoryEnum('category').notNull(),
    uploadedBy: text('uploaded_by').references(() => users.id),
    ...timestamps(),
  },
  (table) => [
    // Danışanın dosya listesi (Dosyalar sekmesi) — en yeniden en eskiye.
    index('documents_client_id_created_at_idx').on(table.clientId, table.createdAt.desc()),
    // Kategori filtresi (ör. sadece "bia_çıktısı" — BİA içe aktarma akışının
    // yan panelde göstereceği liste, GÖREV 4).
    index('documents_client_id_category_idx').on(table.clientId, table.category),
  ],
)

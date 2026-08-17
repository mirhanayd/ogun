// Faturalama şeması — packages, client_packages, payments, expenses.
//
// GitHub issue #40 / Prompt 7.2 (Paket ve tahsilat takibi). GitHub issue #39
// / Prompt 7.1 kapsamında appointments.packageSessionId (bkz. appointments.ts)
// "gerçek bir FK hedefi olmadığı için BİLEREK düz bir text sütun" olarak
// açılmıştı — o placeholder BURADA kapanıyor: appointments.ts artık
// clientPackages'a (aşağı) gerçek bir .references() veriyor.
//
// Tablo adı hakkında not: SQL tablosu roadmap'in orijinal metniyle bire bir
// "packages" (paketler) — bu, monorepo'nun kendi "packages/" dizin adıyla
// salt İSİM benzerliği taşıyor, kavramsal bir çakışma YOK, o yüzden roadmap'e
// sadık kalıp yeniden adlandırılmadı. Ama Drizzle DEĞİŞKEN adı burada
// BİLEREK `billingPackages` (SQL tablo adı hâlâ 'packages') — kodda
// `import { packages } from ...` görüldüğünde bunun npm/pnpm workspace'i mi
// yoksa bu tabloyu mu kastettiği belirsizleşmesin diye.
import { boolean, date, index, integer, numeric, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { clients } from './clients'
import { clinics } from './tenancy'
import { id, timestamps } from './_helpers'

// --- packages (satılabilir seans paketi TANIMI, klinik başına) -------------
export const billingPackages = pgTable(
  'packages',
  {
    id: id(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    name: text('name').notNull(),
    sessionCount: integer('session_count').notNull(),
    // Tüm parasal sütunlar BİLEREK numeric (precision/scale'li) —
    // measurements.ts'teki AYNI desen: drizzle-orm 0.38'de numeric() JS
    // number yerine string döner, kuruş/ondalık yuvarlama hatası riskini
    // ortadan kaldırır (bkz. o dosyadaki not).
    price: numeric('price', { precision: 10, scale: 2 }).notNull(),
    // Satın alma tarihinden itibaren kaç gün geçerli — NULL = süresiz. Her
    // paket bir son kullanma tarihi istemeyebilir (ör. "10 seanslık paket,
    // süre sınırı yok" kliniklerde yaygın bir satış modeli), bu yüzden
    // notNull DEĞİL.
    validityDays: integer('validity_days'),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps(),
  },
  (table) => [
    // Paket seçim listesi (danışana yeni paket satarken) HER ZAMAN
    // clinicId + isActive'e göre daralır (pasif paketler yeni satışta
    // gösterilmez, ama geçmiş client_packages kayıtlarında referans olarak
    // KALMAYA devam eder — bu yüzden isActive=false bir silme değil).
    index('packages_clinic_id_is_active_idx').on(table.clinicId, table.isActive),
  ],
)

// Danışanın SATIN ALDIĞI paket örneği — status hayat döngüsünü izler.
// 'süresi_doldu', expiresAt geçtiğinde bir arka plan işi/sorgu tarafından
// set edilmesi beklenir (bu repoda otomatik bir cron YOK, tıpkı
// clients.scheduledForDeletionAt'in "kalıcı silme worker'ı ayrı bir issue"
// notundaki gibi) — cari hesap ekranı yine de expiresAt'i doğrudan
// karşılaştırarak "süresi dolmuş" durumunu GÖSTERİR (bkz.
// queries/billing.ts resolveClientPackageDisplayStatus), satırın status
// alanı henüz güncellenmemiş olsa bile.
export const clientPackageStatusEnum = pgEnum('client_package_status', [
  'aktif',
  'tamamlandı',
  'süresi_doldu',
  'iptal',
])
export type ClientPackageStatus = (typeof clientPackageStatusEnum.enumValues)[number]

export const clientPackages = pgTable(
  'client_packages',
  {
    id: id(),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id),
    packageId: text('package_id')
      .notNull()
      .references(() => billingPackages.id),
    purchasedAt: timestamp('purchased_at', { withTimezone: true }).notNull().defaultNow(),
    // Satın alma ANINDAKİ gerçek fiyat — billingPackages.price sonradan
    // değişse (klinik fiyat güncellese) bile bu satırdaki tutar SABİT kalır,
    // tıpkı plan kalemlerinin besin referans verisi değişse bile geçmiş
    // kaydın bozulmaması gibi.
    price: numeric('price', { precision: 10, scale: 2 }).notNull(),
    sessionsUsed: integer('sessions_used').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    status: clientPackageStatusEnum('status').notNull().default('aktif'),
    ...timestamps(),
  },
  (table) => [
    // Cari hesap ekranı VE randevu ekranındaki "kalan seans" uyarısı HER
    // ZAMAN "bu danışanın AKTİF paketi" sorgusuyla başlar.
    index('client_packages_client_id_status_idx').on(table.clientId, table.status),
  ],
)

// Roadmap'te (GÖREV 1) bire bir bu şekilde Türkçe verildi — clientStatusEnum
// ile AYNI gerekçe: ürünün kendi iş terimleri.
export const paymentMethodEnum = pgEnum('payment_method', ['nakit', 'kart', 'havale', 'online'])
export type PaymentMethod = (typeof paymentMethodEnum.enumValues)[number]

export const payments = pgTable(
  'payments',
  {
    id: id(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id),
    // Nullable — bir ödeme mutlaka bir pakete bağlı olmak ZORUNDA değil (ör.
    // tek seferlik danışmanlık ücreti, paket dışı ödeme).
    clientPackageId: text('client_package_id').references(() => clientPackages.id),
    amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
    method: paymentMethodEnum('method').notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }).notNull().defaultNow(),
    notes: text('notes'),
    receiptNumber: text('receipt_number'),
    // --- e-SMM hazırlığı (GÖREV 4) ------------------------------------------
    // Gerçek e-fatura/e-SMM entegrasyonu (Paraşüt/BirFatura) PİLOT SONRASI —
    // bkz. apps/web/src/lib/invoicing/. Bu üç alan SADECE makbuz bilgisini
    // saklar, hiçbir sağlayıcıya otomatik göndermez (manuel sağlayıcı bu
    // alanları elle doldurur/işaretler).
    receiptSeries: text('receipt_series'),
    receiptSequenceNumber: text('receipt_sequence_number'),
    receiptIssuedAt: date('receipt_issued_at', { mode: 'string' }),
    ...timestamps(),
  },
  (table) => [
    // Finans paneli aylık gelir toplamı VE cari hesap listesi — ikisi de
    // clinicId/clientId + tarih aralığı sorgusu.
    index('payments_clinic_id_paid_at_idx').on(table.clinicId, table.paidAt.desc()),
    index('payments_client_id_paid_at_idx').on(table.clientId, table.paidAt.desc()),
  ],
)

// Basit gider takibi — roadmap'in AÇIKÇA belirttiği gibi "muhasebe programı
// değiliz": kategori serbest metin (sabit bir gider planı/hesap kodu YOK),
// fatura/belge eki bu issue kapsamında YOK (dosyalar.ts'teki documents
// tablosuyla ileride ilişkilendirilebilir, ama bu issue'da İSTENMEDİ).
export const expenses = pgTable(
  'expenses',
  {
    id: id(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    category: text('category').notNull(),
    amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
    date: date('date', { mode: 'string' }).notNull(),
    description: text('description'),
    ...timestamps(),
  },
  (table) => [index('expenses_clinic_id_date_idx').on(table.clinicId, table.date)],
)

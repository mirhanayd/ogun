// Kimlik ve çok kiracılı yapı — users, clinics, clinic_members, Better Auth tabloları.
import { boolean, integer, pgEnum, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { id, timestamps } from './_helpers'

export const clinicMemberRoleEnum = pgEnum('clinic_member_role', ['owner', 'dietitian', 'assistant'])
export type ClinicMemberRole = (typeof clinicMemberRoleEnum.enumValues)[number]

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'trialing',
  'active',
  'past_due',
  'canceled',
])
export type SubscriptionStatus = (typeof subscriptionStatusEnum.enumValues)[number]

// GitHub issue #35 / Prompt 6.1 — PDF şablonu yoğunluk seçeneği (bkz.
// clinics.pdfDefaultDensity üstündeki not). Diğer enum'lardan (planStatusEnum
// vb.) FARKLI olarak BİLEREK İngilizce — bu bir domain terimi/kullanıcı
// etiketi değil, packages/pdf'in PdfLayoutOptions.density Zod enum'uyla
// (bkz. packages/pdf/src/types.ts) BİREBİR aynı iki teknik değer.
export const pdfDensityEnum = pgEnum('pdf_density', ['compact', 'spacious'])
export type PdfDensity = (typeof pdfDensityEnum.enumValues)[number]

// Better Auth'un beklediği alan adlarıyla (email, name, image, emailVerified, ...)
// birebir uyumlu olacak şekilde tanımlanır — betterAuth() config'inde
// drizzleAdapter'a bu tablo doğrudan verilir, alan eşlemesi otomatik çalışır.
export const users = pgTable('users', {
  id: id(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  name: text('name').notNull(),
  image: text('image'),
  // GitHub issue #47 / Prompt 8.3, GÖREV 1 — "İlk girişte 4 adımlı ürün turu".
  // Kullanıcı bazlı (klinik bazlı DEĞİL): bir kullanıcı birden fazla klinikte
  // üye olabilir (bkz. clinicMembers), ama ürün turu plan editörünün NASIL
  // çalıştığını anlatıyor — bu bilgi kullanıcıya ait, hangi klinikte
  // olduğuna değil. NULL = tur henüz görülmedi.
  productTourCompletedAt: timestamp('product_tour_completed_at', { withTimezone: true }),
  ...timestamps(),
})

// Bir diyetisyenlik kliniği — çok kiracılı yapının kök varlığı. Danışan (client)
// verisine dokunan HER tablo clinicId taşımalı (bkz. src/lib/authz.ts, apps/web).
//
// Onboarding ilerlemesinin kaydı (bkz. Prompt 3.2 — /kurulum, GitHub issue #11):
// ayrı bir "wizard state" tablosu AÇMIYORUZ. Bunun yerine klinik satırının
// kendisi taslak (draft) olarak kullanılıyor:
//   - Adım 1'de (klinik adı/telefon/adres) satır createdBy=kullanıcı ile
//     oluşturuluyor, onboardingCompletedAt henüz NULL kalıyor.
//   - Sonraki adımlar aynı satırı günceller, onboardingStep ilerletilir.
//   - Son adımda (çalışma saatleri) onboardingCompletedAt set edilir VE
//     clinic_members satırı (role='owner') o zaman oluşturulur — yani bir
//     kullanıcı, onboarding'i bitirmeden o kliniğe "üye" sayılmaz, dolayısıyla
//     requireClinic() (session.activeClinicId üzerinden) o ana kadar başarısız
//     olmaya devam eder ve uygulama kabuğuna giremez.
// Taslağı bulmak için: clinics WHERE createdBy = userId AND
// onboardingCompletedAt IS NULL (bkz. packages/db/src/queries/clinics.ts
// getDraftClinicForUser). Bu, kullanıcı sekmeyi kapatıp başka bir cihazdan
// geri dönse bile (çerez/localStorage'a değil, doğrudan kullanıcı kimliğine
// bağlı olduğu için) kaldığı yerden devam edebilmesini sağlar.
export const clinics = pgTable('clinics', {
  id: id(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  logoUrl: text('logo_url'),
  primaryColor: text('primary_color'),
  phone: text('phone'),
  address: text('address'),
  taxId: text('tax_id'),
  subscriptionStatus: subscriptionStatusEnum('subscription_status').notNull().default('trialing'),
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
  // Onboarding sihirbazını başlatan kullanıcı — taslağı yeniden bulmak için.
  createdBy: text('created_by').references(() => users.id),
  onboardingStep: integer('onboarding_step').notNull().default(1),
  onboardingCompletedAt: timestamp('onboarding_completed_at', { withTimezone: true }),
  // Veri saklama süresi ayarı (gün) — KVKK ve denetim kaydı (GitHub issue
  // #12 / Prompt 3.3), bkz. /ayarlar/veri-guvenligi sayfası. Klinik bazında
  // değiştirilebilir bir SAYIdır, hukuki bir metin/karar DEĞİLDİR — kesin
  // saklama süresi ürün sahibi/hukuk ekibi tarafından ayrıca belirlenecek.
  // 3650 (10 yıl) sadece güvenli bir başlangıç varsayılanı, bir yasal tavsiye
  // değil.
  dataRetentionDays: integer('data_retention_days').notNull().default(3650),

  // --- PDF çıktısı klinik-varsayılanları (GitHub issue #35 / Prompt 6.1) ---
  // schema/plans.ts planOutputFormatEnum üstündeki nottaki AÇIK KAPI
  // burada kapatılıyor: "klinik-varsayılanı ihtiyacı, o ayarlar modülü
  // kurulduğunda ayrı bir issue'nun kapsamı" deniyordu — ayrı bir "klinik
  // ayarları" modülü hâlâ YOK, ama roadmap Prompt 6.1'in kendisi net biçimde
  // "klinik-seviyeli varsayılan" istiyor (bkz. GÖREV: "Template seçenekleri
  // [...] plan başına ayarlanabilir OLMALI VE klinik seviyesinde bir
  // varsayılanı OLMALI"). Bu yüzden BURADA, mevcut clinics tablosuna, minimal
  // iki sütun eklendi (yeni bir "klinik ayarları" tablosu AÇILMADI — tek
  // satırlık, düşük kardinaliteli iki tercih için ayrı bir tablo gereksiz
  // normalizasyon olurdu, tıpkı dataRetentionDays'in de burada durması gibi).
  // Plan başına tercih zaten var (dietPlans.outputFormat, #28) — kalori
  // göster/gizle VE kompakt/geniş için PLAN seviyesinde bir sütun YOK (bu
  // issue kapsamında eklenmedi, PDF oluşturma diyalогunda seçilip klinik
  // varsayılanını override eder ama KALICI olarak plana kaydedilmez) —
  // bkz. apps/web/src/lib/validation/pdf-schemas.ts.
  pdfDefaultDensity: pdfDensityEnum('pdf_default_density').notNull().default('spacious'),
  pdfDefaultShowCalories: boolean('pdf_default_show_calories').notNull().default(true),

  // --- Paylaşım mesaj şablonu (GitHub issue #36 / Prompt 6.2, GÖREV 2) ---
  // "Klinik ayarlarında mesaj şablonu özelleştirilebilsin" — pdfDefault*
  // ile AYNI desen (mevcut clinics satırına minimal bir sütun, ayrı bir
  // "klinik ayarları" tablosu YOK). NULL = varsayılan şablon kullanılır
  // (bkz. apps/web/src/lib/share/message-template.ts DEFAULT_WHATSAPP_TEMPLATE)
  // — mevcut kliniklerin (bu sütun eklenmeden önce oluşturulanlar dahil)
  // davranışı DEĞİŞMEZ. Yer tutucular ({danisanAdi}, {planAdi}, {link}) düz
  // metin İÇİNDE serbestçe kullanılabilir, bkz. o dosyadaki render fonksiyonu.
  whatsappMessageTemplate: text('whatsapp_message_template'),

  // --- SMS hatırlatma şablonu (GitHub issue #41 / Prompt 7.3, GÖREV 3) ------
  // whatsappMessageTemplate ile AYNI desen: NULL = varsayılan şablon (bkz.
  // apps/web/src/lib/sms/reminder-template.ts DEFAULT_SMS_REMINDER_TEMPLATE).
  smsReminderTemplate: text('sms_reminder_template'),

  ...timestamps(),
})

// Bir kullanıcının bir klinikteki üyeliği ve rolü. Aynı kullanıcı birden fazla
// klinikte üye olabilir (bkz. üst bar klinik seçici, Prompt 3.2).
export const clinicMembers = pgTable(
  'clinic_members',
  {
    id: id(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    role: clinicMemberRoleEnum('role').notNull(),
    invitedBy: text('invited_by').references(() => users.id),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    ...timestamps(),
  },
  (table) => [uniqueIndex('clinic_members_clinic_id_user_id_idx').on(table.clinicId, table.userId)],
)

// Better Auth — oturum tablosu. activeClinicId ve role, oturuma özel (custom
// session fields) alanlardır: kullanıcı birden çok klinikte üye olabildiği için
// "şu an hangi klinikte çalışıyor" bilgisi oturuma, kullanıcıya değil, bağlıdır.
export const sessions = pgTable('sessions', {
  id: id(),
  token: text('token').notNull().unique(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  activeClinicId: text('active_clinic_id').references(() => clinics.id),
  role: clinicMemberRoleEnum('role'),
  ...timestamps(),
})

// Better Auth — e-posta/şifre ve OAuth (Google) sağlayıcı hesapları.
export const accounts = pgTable('accounts', {
  id: id(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  ...timestamps(),
})

// Better Auth — e-posta doğrulama ve şifre sıfırlama tokenları.
export const verifications = pgTable('verifications', {
  id: id(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ...timestamps(),
})

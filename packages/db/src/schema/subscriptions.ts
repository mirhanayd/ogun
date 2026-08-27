// Abonelik şeması — subscriptions, subscription_events.
//
// GitHub issue #41 / Prompt 7.3, GÖREV 1. clinics tablosunda (schema/tenancy.ts)
// GitHub issue #10'dan beri VAR OLAN subscriptionStatus + trialEndsAt alanları
// BURADA TEKRARLANMIYOR (roadmap talimatı: "check exact current values, extend
// rather than duplicate") — clinics.subscriptionStatus/trialEndsAt "şu an
// geçerli durum" için TEK kaynak olmaya devam eder (ör. requireClinic() sonrası
// hızlı bir "deneme bitti mi" kontrolü, ekstra bir JOIN olmadan). Bu tablo
// SADECE plan seçimi + sağlayıcı detayını ekler: klinik başına TEK satır
// (uniqueIndex clinicId) — billingPackages/clientPackages'taki "tanım vs.
// örnek" ayrımından FARKLI olarak burada plan TANIMLARI (Başlangıç/Klinik/
// Kurumsal fiyat/limit) DB'de DEĞİL, apps/web/src/lib/subscription/plans.ts'te
// statik bir sabit — "basit tut" kuralı (bkz. schema/billing.ts expenses
// notundaki aynı gerekçe), üç sabit plan için ayrı bir plan-tanımı tablosu
// gereksiz normalizasyon olurdu.
import { boolean, index, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { clinics, users } from './tenancy'
import { id, timestamps } from './_helpers'

// Roadmap'te (Prompt 7.3, GÖREV 1) bire bir Türkçe verilen plan adları —
// clientStatusEnum/appointmentTypeEnum ile AYNI gerekçe: ürünün kendi ticari
// terimleri, İngilizce bir kod adı değil.
export const subscriptionPlanEnum = pgEnum('subscription_plan', ['başlangıç', 'klinik', 'kurumsal'])
export type SubscriptionPlan = (typeof subscriptionPlanEnum.enumValues)[number]

// GitHub issue #40 / Prompt 7.2, InvoiceProviderName ile AYNI desen — "manuel"
// (bkz. apps/web/src/lib/subscription/payment-provider/manual-provider.ts) TEK
// çalışan implementasyon, 'iyzico' | 'paytr' değerleri İLERİDE gerçek
// entegrasyon geldiğinde kullanılacak (roadmap: "ileride PayTR'ye geçmek
// kolay olsun").
export const paymentProviderNameEnum = pgEnum('payment_provider_name', ['manuel', 'iyzico', 'paytr'])
export type PaymentProviderNameValue = (typeof paymentProviderNameEnum.enumValues)[number]

export const subscriptionBillingCycleEnum = pgEnum('subscription_billing_cycle', ['monthly', 'yearly'])
export type SubscriptionBillingCycle = (typeof subscriptionBillingCycleEnum.enumValues)[number]

// Hesap oluşturulduktan hemen sonra, klinik henüz kurulmadan yapılan zorunlu
// paket seçimi. Klinik tamamlandığında seçim subscriptions satırına taşınır.
export const subscriptionSelections = pgTable(
  'subscription_selections',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    planCode: subscriptionPlanEnum('plan_code').notNull(),
    billingCycle: subscriptionBillingCycleEnum('billing_cycle').notNull(),
    ...timestamps(),
  },
  (table) => [uniqueIndex('subscription_selections_user_id_idx').on(table.userId)],
)

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: id(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    planCode: subscriptionPlanEnum('plan_code').notNull(),
    billingCycle: subscriptionBillingCycleEnum('billing_cycle').notNull().default('monthly'),
    provider: paymentProviderNameEnum('provider').notNull().default('manuel'),
    // Gerçek sağlayıcıdaki (iyzico) müşteri/abonelik kimlikleri — manuel
    // sağlayıcıda her zaman NULL (dış sistemde bir karşılığı yok, bkz.
    // invoicing/manual-provider.ts externalId ile AYNI gerekçe).
    providerCustomerId: text('provider_customer_id'),
    providerSubscriptionId: text('provider_subscription_id'),
    // Checkout başlatma ile callback arasındaki kısa ömürlü iyzico token'ı.
    checkoutToken: text('checkout_token'),
    // Dönem sonunda iptal edilecek mi — kart bilgisi olmadan başlayan deneme
    // ve manuel sağlayıcıda "hemen iptal" ile "dönem sonunda iptal" ayrımı
    // şimdilik BASİTLEŞTİRİLDİ: iptal action'ı ikisini de bu bayrağı set
    // ederek işaretler, gerçek sağlayıcı geldiğinde webhook bu alanı okuyup
    // dönem sonunda gerçek iptali tetikleyecek.
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    // Klinik başına TEK abonelik satırı (bkz. dosya başı notu) — plan
    // değişiklikleri bu satırı GÜNCELLER, yeni satır AÇMAZ; geçmiş, aşağıdaki
    // subscription_events'te tutulur.
    uniqueIndex('subscriptions_clinic_id_idx').on(table.clinicId),
    uniqueIndex('subscriptions_checkout_token_idx').on(table.checkoutToken),
  ],
)

// Webhook olayları — roadmap'in AÇIKÇA istediği ayrı tablo ("webhook olayları
// için subscription_events"). Gerçek iyzico webhook'u henüz YOK (bu issue
// kapsamında manuel sağlayıcı kullanılıyor, bkz. payment-provider/), bu
// yüzden bugün BURAYA yazan tek kaynak kendi action'larımız (plan seçimi,
// iptal) — ama şema, gerçek bir webhook handler'ının (ileride) aynen
// kullanabileceği şekilde tasarlandı: eventType SERBEST METİN (auditLogs.
// entityType/action ile AYNI gerekçe — iyzico'nun kendi olay adlarını
// [ör. "subscription.payment_success"] birebir saklayabilmek için sabit bir
// enum'a HAPSETMİYORUZ), payload ham JSON'u tutar.
export const subscriptionEvents = pgTable(
  'subscription_events',
  {
    id: id(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    subscriptionId: text('subscription_id').references(() => subscriptions.id),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Abonelik geçmişi zaman sırasıyla (bkz. /ayarlar/abonelik "geçmiş" listesi).
    index('subscription_events_clinic_id_occurred_at_idx').on(table.clinicId, table.occurredAt.desc()),
  ],
)

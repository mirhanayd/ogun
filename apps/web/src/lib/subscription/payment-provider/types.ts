// GitHub issue #41 / Prompt 7.3, GÖREV 1 — iyzico abonelik entegrasyonu.
// apps/web/src/lib/invoicing/types.ts (GitHub #40) ve lib/email/types.ts
// (GitHub #36) ile BİREBİR AYNI desen: PaymentProvider, gerçek sağlayıcıyı
// (iyzico API'si) çağıran koddan SOYUTLAR — roadmap'in açık talimatı
// ("ödeme sağlayıcı mantığını bir arayüz arkasına al, ileride PayTR'ye
// geçmek kolay olsun"). Çağıran kod (ayarlar/abonelik/actions.ts) SADECE bu
// arayüze karşı yazılır, hangi implementasyonun (bkz. manual-provider.ts)
// kullanıldığını BİLMEZ — ileride IyzicoPaymentProvider eklenince SADECE
// index.ts değişir.
import type { SubscriptionPlan } from '@ogun/db/schema'

export interface StartSubscriptionInput {
  clinicId: string
  clinicName: string
  billingEmail: string
  planCode: SubscriptionPlan
}

export interface SubscriptionCheckoutResult {
  provider: PaymentProviderName
  // Gerçek sağlayıcılarda (iyzico/PayTR) diyetisyenin kart bilgisi gireceği
  // barındırılan (hosted) ödeme sayfası — manuel sağlayıcıda HER ZAMAN null
  // (kart bilgisi hiç istenmiyor, bkz. dosya başı notu ve roadmap "14 gün
  // ücretsiz deneme, kart bilgisi istemeden").
  checkoutUrl: string | null
  providerCustomerId: string | null
  providerSubscriptionId: string | null
  currentPeriodStart: Date
  currentPeriodEnd: Date | null
}

export interface CancelSubscriptionInput {
  clinicId: string
  providerSubscriptionId: string | null
}

export type PaymentProviderName = 'manuel' | 'iyzico' | 'paytr'

export interface PaymentProvider {
  readonly name: PaymentProviderName
  startSubscription(input: StartSubscriptionInput): Promise<SubscriptionCheckoutResult>
  cancelSubscription(input: CancelSubscriptionInput): Promise<void>
}

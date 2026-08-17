import type { PaymentProvider, StartSubscriptionInput, SubscriptionCheckoutResult } from './types'

// "Manuel" sağlayıcı — GitHub issue #41 / Prompt 7.3, GÖREV 1'in istediği TEK
// implementasyon (bkz. lib/invoicing/manual-provider.ts dosya başı notuyla
// AYNI gerekçe: bu ortamda GERÇEK iyzico API anahtarı/kimlik bilgisi YOK,
// "gerçek entegrasyon pilot sonrası" — roadmap'in kendi ifadesi). Hiçbir dış
// API çağırmaz: abonelik "hemen onaylanmış" sayılır (checkoutUrl null —
// diyetisyen hiçbir ödeme sayfasına yönlendirilmez), dönem 30 gün olarak
// yerel saatte hesaplanır. Bu, gerçek bir ödeme alma mekanizması DEĞİL —
// sadece "plan seçildi, deneme/aktiflik durumu takip edilsin" kaydını tutar.
const MANUAL_PERIOD_DAYS = 30

export function createManualPaymentProvider(): PaymentProvider {
  return {
    name: 'manuel',
    async startSubscription(input: StartSubscriptionInput): Promise<SubscriptionCheckoutResult> {
      const currentPeriodStart = new Date()
      const currentPeriodEnd = new Date(currentPeriodStart.getTime() + MANUAL_PERIOD_DAYS * 24 * 60 * 60 * 1000)
      return {
        provider: 'manuel',
        checkoutUrl: null,
        // Gerçek sağlayıcılarda dış sistemin ürettiği bir kimlik olurdu —
        // manuel sağlayıcıda dış sistemde bir karşılığı yok (bkz.
        // invoicing/manual-provider.ts externalId ile AYNI gerekçe), bu
        // yüzden input.clinicId'den TÜRETİLEN, sadece okunabilirlik için
        // bir yer tutucu kimlik üretiliyor.
        providerCustomerId: `manuel-${input.clinicId}`,
        providerSubscriptionId: `manuel-${input.clinicId}-${input.planCode}`,
        currentPeriodStart,
        currentPeriodEnd,
      }
    },
    async cancelSubscription(): Promise<void> {
      // Manuel sağlayıcıda iptal, dış sistemde çağrılacak bir şey yok —
      // asıl durum değişikliği (clinics.subscriptionStatus, subscriptions.
      // cancelAtPeriodEnd) çağıran taraf (actions.ts) tarafından DB'ye
      // yazılıyor. Bu fonksiyon sadece arayüz uyumluluğu (Promise<void>)
      // için var, gerçek sağlayıcı geldiğinde burada bir API çağrısı olacak.
    },
  }
}

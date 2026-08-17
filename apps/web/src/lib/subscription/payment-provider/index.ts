import { createManualPaymentProvider } from './manual-provider'
import type { PaymentProvider } from './types'

export type {
  CancelSubscriptionInput,
  PaymentProvider,
  PaymentProviderName,
  StartSubscriptionInput,
  SubscriptionCheckoutResult,
} from './types'

// GitHub issue #41 / Prompt 7.3 — TEK üretim noktası, lib/invoicing/index.ts
// (GitHub #40) ile AYNI dolaylılık: çağıran kod getPaymentProvider()'ı
// çağırır, manual-provider.ts'i DOĞRUDAN import ETMEZ. Bugün tek
// implementasyon (manuel) var; hangi gerçek sağlayıcının (iyzico/PayTR)
// kullanılacağı "pilot sonrası" netleşecek — o zaman SADECE burası değişir.
let cachedProvider: PaymentProvider | null = null

export function getPaymentProvider(): PaymentProvider {
  if (!cachedProvider) {
    cachedProvider = createManualPaymentProvider()
  }
  return cachedProvider
}

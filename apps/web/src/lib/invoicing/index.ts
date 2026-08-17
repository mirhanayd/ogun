import { createManualInvoiceProvider } from './manual-provider'
import type { InvoiceProvider } from './types'

export type { InvoiceProvider, InvoiceProviderName, InvoiceReceiptInput, IssuedReceipt } from './types'

// GitHub issue #40 / Prompt 7.2 — TEK üretim noktası, lib/email/index.ts
// (GitHub issue #36) ile AYNI dolaylılık: çağıran kod getInvoiceProvider()'ı
// çağırır, manual-provider.ts'i DOĞRUDAN import ETMEZ. Bugün tek implementasyon
// (manuel) var; hangi gerçek sağlayıcının (Paraşüt/BirFatura) kullanılacağı
// "pilot sonrası" netleşecek — o zaman SADECE burası değişir.
let cachedProvider: InvoiceProvider | null = null

export function getInvoiceProvider(): InvoiceProvider {
  if (!cachedProvider) {
    cachedProvider = createManualInvoiceProvider()
  }
  return cachedProvider
}

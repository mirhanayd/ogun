import { createManualSmsSender } from './manual-provider'
import type { SmsSender } from './types'

export type { SendSmsInput, SendSmsResult, SmsSender, SmsProviderName } from './types'

// GitHub issue #41 / Prompt 7.3 — TEK üretim noktası, lib/invoicing/index.ts
// (GitHub #40) ile AYNI dolaylılık: çağıran kod getSmsSender()'ı çağırır,
// manual-provider.ts'i DOĞRUDAN import ETMEZ. Bugün tek implementasyon
// (manuel) var; gerçek Netgsm entegrasyonu "pilot sonrası" netleşecek — o
// zaman SADECE burası değişir.
let cachedSender: SmsSender | null = null

export function getSmsSender(): SmsSender {
  if (!cachedSender) {
    cachedSender = createManualSmsSender()
  }
  return cachedSender
}

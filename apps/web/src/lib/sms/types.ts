// GitHub issue #41 / Prompt 7.3, GÖREV 3 — Netgsm SMS entegrasyonu.
// lib/invoicing/types.ts (GitHub #40) ve lib/email/types.ts (GitHub #36) ile
// BİREBİR AYNI desen: SmsSender, gerçek sağlayıcıyı (Netgsm API'si) çağıran
// koddan SOYUTLAR. Çağıran kod (reminder-runner.ts) SADECE bu arayüze karşı
// yazılır, hangi implementasyonun (bkz. manual-provider.ts) kullanıldığını
// BİLMEZ — ileride NetgsmSmsSender eklenince SADECE index.ts değişir.
export interface SendSmsInput {
  to: string
  message: string
}

export interface SendSmsResult {
  provider: SmsProviderName
  // Gerçek sağlayıcının (Netgsm) döndürdüğü mesaj/iletim kimliği — manuel
  // sağlayıcıda her zaman null (dış sistemde bir karşılığı yok, bkz.
  // invoicing/manual-provider.ts externalId ile AYNI gerekçe).
  externalMessageId: string | null
}

export type SmsProviderName = 'manuel' | 'netgsm'

export interface SmsSender {
  readonly name: SmsProviderName
  send(input: SendSmsInput): Promise<SendSmsResult>
}

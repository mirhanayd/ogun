import type { SendSmsInput, SendSmsResult, SmsSender } from './types'

// "Manuel" sağlayıcı — GitHub issue #41 / Prompt 7.3, GÖREV 3'ün istediği TEK
// implementasyon (bkz. lib/invoicing/manual-provider.ts dosya başı notuyla
// AYNI gerekçe: bu ortamda GERÇEK Netgsm API kullanıcı adı/şifre/başlık bilgisi
// YOK, "gerçek entegrasyon pilot sonrası" — roadmap'in kendi ifadesi). Hiçbir
// dış SMS API'si ÇAĞIRMAZ — mesajı sunucu konsoluna yazar ve "gönderildi"
// sayar. Gerçek Netgsm entegrasyonu (bkz. NETGSM_* ortam değişkenleri,
// .env.example) geldiğinde SADECE index.ts'teki üretim noktası değişecek,
// reminder-runner.ts hiç değişmeyecek.
export function createManualSmsSender(): SmsSender {
  return {
    name: 'manuel',
    async send(input: SendSmsInput): Promise<SendSmsResult> {
      // Manuel sağlayıcının TEK "gönderim mekanizması" bu — gerçek Netgsm
      // entegrasyonu gelene kadar SMS'in gerçekten "gönderildiğini"
      // görebilmenin tek yolu.
      console.info(`[sms:manuel] -> ${input.to}: ${input.message}`)
      return { provider: 'manuel', externalMessageId: crypto.randomUUID() }
    },
  }
}

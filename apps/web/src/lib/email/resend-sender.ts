import 'server-only'
import { Resend } from 'resend'
import type { EmailSender, SendEmailInput } from './types'

// GitHub issue #36 / Prompt 6.2, GÖREV 3 — Resend implementasyonu.
//
// NEDEN RESEND (SMTP DEĞİL) — PR açıklamasında da tekrarlanan karar:
// SMTP kendi posta sunucusu/relay yapılandırması (SPF/DKIM/DMARC, IP itibarı)
// gerektirir; Resend bunu yönetir VE ücretsiz katmanı (aylık 3000 e-posta,
// bu ölçekte bir klinik SaaS'ı için fazlasıyla yeterli) tek bir API anahtarıyla
// çalışır. Node fetch tabanlı REST API kullanır (resend SDK'sı) — Vercel'e
// özel bir API DEĞİL (mimari kural #4), düz bir Node sürecinde/Docker
// container'ında AYNEN çalışır (SMTP de çalışırdı, ama ek altyapı yükü
// Resend'den daha fazla olurdu — solo/küçük ekip için karar Resend lehine).
// RESEND_API_KEY yoksa gönderim DENENMEDEN anlaşılır bir hata fırlatılır.
export function createResendEmailSender(): EmailSender {
  return {
    async send(input: SendEmailInput): Promise<void> {
      const apiKey = process.env.RESEND_API_KEY
      if (!apiKey) {
        throw new Error('RESEND_API_KEY ortam değişkeni tanımlı değil — e-posta gönderimi yapılandırılmamış.')
      }
      const from = process.env.RESEND_FROM_EMAIL
      if (!from) {
        throw new Error('RESEND_FROM_EMAIL ortam değişkeni tanımlı değil.')
      }

      const resend = new Resend(apiKey)
      const { error } = await resend.emails.send({
        from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
        attachments: input.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
        })),
      })
      if (error) {
        throw new Error(`E-posta gönderilemedi: ${error.message}`)
      }
    },
  }
}

import 'server-only'
import { createResendEmailSender } from './resend-sender'
import type { EmailSender } from './types'

export type { EmailAttachment, EmailSender, SendEmailInput } from './types'

// GitHub issue #36 / Prompt 6.2 — TEK üretim noktası: share-actions.ts (ve
// ileride başka bir çağıran) getEmailSender()'ı çağırır, resend-sender.ts'i
// DOĞRUDAN import ETMEZ. Bugün tek implementasyon (Resend) var, ama bu
// dolaylılık (indirection) "swappable behind a small interface" gereğini
// somutlaştırıyor — yarın bir SmtpEmailSender eklenirse SADECE burası
// değişir, çağıran kod hiç değişmez.
let cachedSender: EmailSender | null = null

export function getEmailSender(): EmailSender {
  if (!cachedSender) {
    cachedSender = createResendEmailSender()
  }
  return cachedSender
}

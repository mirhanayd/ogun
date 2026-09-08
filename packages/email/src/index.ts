import 'server-only'
import { createResendEmailSender } from './resend-sender'
import type { EmailSender } from './types'

export type { EmailAttachment, EmailSender, SendEmailInput } from './types'
export { createResendEmailSender } from './resend-sender'

let cachedSender: EmailSender | null = null

export function getEmailSender(): EmailSender {
  cachedSender ??= createResendEmailSender()
  return cachedSender
}

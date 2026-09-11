import 'server-only'
import { createResendEmailSender } from './resend-sender'
import type { EmailSender } from './types'

export type { EmailAttachment, EmailSender, SendEmailInput } from './types'
export { createResendEmailSender } from './resend-sender'
export { renderEmailVerificationEmail, type EmailVerificationEmailInput } from './email-verification'
export {
  buildSupportTicketEmail,
  type SupportEmailData,
  type SupportEmailType,
} from './support-ticket'
export {
  buildClinicalReviewerInvitationEmail,
  buildClinicalReviewerVerificationEmail,
  type ClinicalReviewerInvitationEmailData,
  type ClinicalReviewerVerificationEmailData,
} from './clinical-reviewer-invitation'
export {
  buildSubscriptionOperationEmail,
  type SubscriptionOperationEmailData,
} from './subscription-operation'

let cachedSender: EmailSender | null = null

export function getEmailSender(): EmailSender {
  cachedSender ??= createResendEmailSender()
  return cachedSender
}

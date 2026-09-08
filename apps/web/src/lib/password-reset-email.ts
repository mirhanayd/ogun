import { getEmailSender, type EmailSender } from '@ogun/email'
import { renderPasswordResetEmail } from '@ogun/email/password-reset'

export async function sendOgunPasswordResetEmail(
  input: { email: string; resetUrl: string },
  sender: EmailSender = getEmailSender(),
) {
  await sender.send({ to: input.email, ...renderPasswordResetEmail({ resetUrl: input.resetUrl }) })
}

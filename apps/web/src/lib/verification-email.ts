import { getEmailSender, type EmailSender } from '@ogun/email'
import { renderEmailVerificationEmail } from '@ogun/email/email-verification'

function canonicalVerificationUrl(generatedUrl: string): string {
  const configured = process.env.BETTER_AUTH_URL
  if (!configured) throw new Error('BETTER_AUTH_URL is required for verification email delivery.')
  const canonical = new URL(configured)
  const generated = new URL(generatedUrl)
  return new URL(`${generated.pathname}${generated.search}`, canonical).toString()
}

export async function sendOgunVerificationEmail(
  input: { email: string; verificationUrl: string },
  sender: EmailSender = getEmailSender(),
) {
  const verificationUrl = canonicalVerificationUrl(input.verificationUrl)
  await sender.send({
    to: input.email,
    ...renderEmailVerificationEmail({ verificationUrl }),
  })
}

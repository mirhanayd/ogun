import { describe, expect, it } from 'vitest'
import { renderEmailVerificationEmail } from './email-verification'

describe('email verification email', () => {
  it('renders text and escaped HTML without dropping the token', () => {
    const verificationUrl = 'https://app.example/api/auth/verify-email?token=abc&callbackURL=%2Fplan-sec'
    const email = renderEmailVerificationEmail({ verificationUrl })

    expect(email.subject).toBe('Ogun e-posta doğrulama')
    expect(email.text).toContain(verificationUrl)
    expect(email.html).toContain('token=abc&amp;callbackURL=%2Fplan-sec')
    expect(email.html).not.toContain('token=abc&callbackURL')
  })
})

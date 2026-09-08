import { describe, expect, it } from 'vitest'
import { renderPasswordResetEmail } from './password-reset'

describe('password reset email', () => {
  it('renders Turkish html and text without altering the reset URL', () => {
    const resetUrl = 'https://app.example/reset?token=abc&next=%2Fpanel'
    const email = renderPasswordResetEmail({ resetUrl })
    expect(email.subject).toBe('Ogun şifre sıfırlama')
    expect(email.text).toContain(resetUrl)
    expect(email.html).toContain('token=abc&amp;next=%2Fpanel')
    expect(email.html).toContain('Şifremi Sıfırla')
  })
})

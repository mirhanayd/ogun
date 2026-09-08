import { describe, expect, it, vi } from 'vitest'
import { sendOgunPasswordResetEmail } from './password-reset-email'

describe('Ogun password reset delivery', () => {
  it('invokes the injected sender and never logs the reset URL', async () => {
    const send = vi.fn(async () => undefined)
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    await sendOgunPasswordResetEmail({ email: 'user@example.com', resetUrl: 'https://app.example/reset?token=secret' }, { send })
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: 'user@example.com', subject: 'Ogun şifre sıfırlama' }))
    expect(consoleSpy).not.toHaveBeenCalled()
  })

  it('propagates sender failures', async () => {
    await expect(sendOgunPasswordResetEmail({ email: 'user@example.com', resetUrl: 'https://app.example/reset' }, { send: async () => { throw new Error('provider down') } })).rejects.toThrow('provider down')
  })
})

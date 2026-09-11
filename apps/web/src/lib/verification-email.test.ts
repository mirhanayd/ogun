import { afterEach, describe, expect, it, vi } from 'vitest'
import { sendOgunVerificationEmail } from './verification-email'

const originalUrl = process.env.BETTER_AUTH_URL

afterEach(() => {
  if (originalUrl === undefined) delete process.env.BETTER_AUTH_URL
  else process.env.BETTER_AUTH_URL = originalUrl
})

describe('Ogun verification delivery', () => {
  it('rebuilds the link on the configured canonical origin and does not log it', async () => {
    process.env.BETTER_AUTH_URL = 'https://app.ogun.test'
    const send = vi.fn(async () => undefined)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    await sendOgunVerificationEmail(
      {
        email: 'user@example.test',
        verificationUrl: 'https://attacker.invalid/api/auth/verify-email?token=secret&callbackURL=%2Fplan-sec',
      },
      { send },
    )

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.test',
        text: expect.stringContaining('https://app.ogun.test/api/auth/verify-email?token=secret'),
      }),
    )
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('fails closed when the canonical origin is absent', async () => {
    delete process.env.BETTER_AUTH_URL
    await expect(
      sendOgunVerificationEmail(
        { email: 'user@example.test', verificationUrl: 'https://app.example/verify?token=secret' },
        { send: async () => undefined },
      ),
    ).rejects.toThrow('BETTER_AUTH_URL')
  })
})

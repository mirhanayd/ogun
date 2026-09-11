import { randomUUID } from 'node:crypto'
import { db } from '@ogun/db'
import * as schema from '@ogun/db/schema'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { betterAuth } from 'better-auth'
import { describe, expect, it, vi } from 'vitest'

const describeWithDatabase = process.env.PLATFORM_OPERATION_WRITE_TESTS === '1' ? describe : describe.skip

describeWithDatabase('Better Auth password reset flow (real database)', () => {
  it('creates and consumes the official reset token without exposing it', async () => {
    const delivered = vi.fn(async (message: { email: string; url: string }) => {
      void message
    })
    const resetAuth = betterAuth({
      database: drizzleAdapter(db, {
        provider: 'pg',
        usePlural: true,
        schema,
      }),
      secret: 'phase-two-password-reset-integration-secret',
      baseURL: 'http://localhost:3000',
      trustedOrigins: ['http://localhost:3000'],
      emailAndPassword: {
        enabled: true,
        sendResetPassword: async ({ user, url }) => delivered({ email: user.email, url }),
      },
    })
    const context = await resetAuth.$context
    const email = `phase-two-reset-${randomUUID()}@ogun.test`
    const user = await context.internalAdapter.createUser({ email, name: 'Reset Akışı', emailVerified: true })

    try {
      const requestResult = await resetAuth.api.requestPasswordReset({
        body: { email, redirectTo: 'http://localhost:3000/sifre-sifirla' },
        headers: new Headers({ origin: 'http://localhost:3000' }),
      })

      expect(requestResult.status).toBe(true)
      expect(delivered).toHaveBeenCalledTimes(1)
      expect(delivered).toHaveBeenCalledWith(expect.objectContaining({ email }))

      const deliveredUrl = delivered.mock.calls[0]?.[0].url
      const token = deliveredUrl?.match(/\/reset-password\/([^?]+)/)?.[1]
      expect(token).toBeTruthy()

      const resetResult = await resetAuth.api.resetPassword({
        body: { newPassword: 'Yeni-Sifre-2026!', token },
      })
      expect(resetResult.status).toBe(true)

      const accounts = await context.internalAdapter.findAccounts(user.id)
      const credential = accounts.find((account) => account.providerId === 'credential')
      expect(credential?.password).toBeTruthy()
      expect(credential?.password).not.toBe('Yeni-Sifre-2026!')
      await expect(context.internalAdapter.findVerificationValue(`reset-password:${token}`)).resolves.toBeNull()
    } finally {
      await context.internalAdapter.deleteAccounts(user.id)
      await context.internalAdapter.deleteUser(user.id)
    }
  })

  it('returns a generic successful registration envelope for existing addresses', async () => {
    const privacyAuth = betterAuth({
      database: drizzleAdapter(db, { provider: 'pg', usePlural: true, schema }),
      secret: 'phase-eight-enumeration-resistance-secret',
      baseURL: 'http://localhost:3000',
      trustedOrigins: ['http://localhost:3000'],
      emailAndPassword: { enabled: true, autoSignIn: false },
      emailVerification: {
        sendOnSignUp: true,
        sendVerificationEmail: async () => undefined,
      },
    })
    const context = await privacyAuth.$context
    const suffix = randomUUID()
    const existingEmail = `existing-${suffix}@ogun.test`
    const newEmail = `new-${suffix}@ogun.test`
    const existingUser = await context.internalAdapter.createUser({
      email: existingEmail,
      name: 'Existing User',
      emailVerified: false,
    })
    let newUserId: string | undefined

    try {
      const headers = new Headers({ origin: 'http://localhost:3000' })
      const existingResult = await privacyAuth.api.signUpEmail({
        body: { email: existingEmail, name: 'Submitted Name', password: 'Strong-pass-2026!' },
        headers,
      })
      const newResult = await privacyAuth.api.signUpEmail({
        body: { email: newEmail, name: 'Submitted Name', password: 'Strong-pass-2026!' },
        headers,
      })
      newUserId = newResult.user.id

      expect(existingResult.token).toBeNull()
      expect(newResult.token).toBeNull()
      expect(Object.keys(existingResult).sort()).toEqual(Object.keys(newResult).sort())
      expect(Object.keys(existingResult.user).sort()).toEqual(Object.keys(newResult.user).sort())
      expect(existingResult.user.email).toBe(existingEmail)
      expect(newResult.user.email).toBe(newEmail)
    } finally {
      if (newUserId) {
        await context.internalAdapter.deleteAccounts(newUserId)
        await context.internalAdapter.deleteUser(newUserId)
      }
      await context.internalAdapter.deleteUser(existingUser.id)
    }
  })
})

import { betterAuth } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'
import { twoFactor } from 'better-auth/plugins'
import { db } from '@ogun/db'
import { getPlatformStaffByEmail, getPlatformStaffByUserId } from '@ogun/db/queries'
import * as schema from '@ogun/db/schema'

const baseURL = process.env.ADMIN_BETTER_AUTH_URL ?? 'http://localhost:3001'
const secret = process.env.ADMIN_BETTER_AUTH_SECRET
if (!secret) {
  throw new Error('ADMIN_BETTER_AUTH_SECRET is required. The web auth secret must not be reused implicitly.')
}

export const auth = betterAuth({
  appName: 'Ogun Operasyon',
  database: drizzleAdapter(db, { provider: 'pg', usePlural: true, schema }),
  secret,
  baseURL,
  trustedOrigins: [baseURL],
  emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 8 },
  session: {
    modelName: 'adminSession',
    expiresIn: 60 * 60 * 8,
    updateAge: 60 * 60,
    freshAge: 60 * 10,
  },
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const staff = await getPlatformStaffByUserId(db, session.userId)
          return Boolean(staff?.isActive)
        },
      },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== '/sign-in/email') return
      const email = typeof ctx.body?.email === 'string' ? ctx.body.email : ''
      const staff = email ? await getPlatformStaffByEmail(db, email) : null
      if (!staff?.isActive) {
        throw new APIError('UNAUTHORIZED', { message: 'Giriş bilgileri doğrulanamadı.' })
      }
    }),
  },
  advanced: {
    cookiePrefix: 'ogun-admin',
    defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' },
  },
  plugins: [
    twoFactor({
      issuer: 'Ogun Operasyon',
      twoFactorTable: 'twoFactor',
      twoFactorCookieMaxAge: 60 * 10,
      trustDeviceMaxAge: 0,
      totpOptions: { digits: 6, period: 30 },
    }),
    nextCookies(),
  ],
})

export type AdminAuth = typeof auth

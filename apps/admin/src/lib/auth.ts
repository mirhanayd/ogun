import { betterAuth } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'
import { twoFactor } from 'better-auth/plugins'
import { db } from '@ogun/db'
import { getPlatformStaffByEmail, getPlatformStaffByUserId } from '@ogun/db/queries'
import * as schema from '@ogun/db/schema'
import { resolveAdminAuthBaseUrl } from '../env'
import { classifyAdminDatabaseTarget } from './auth-diagnostics'

// Better Auth's database limiter always resolves the logical `rateLimit`
// model. Map that model to an admin-only physical table so web and admin IP
// buckets cannot collide even though the identity tables are shared.
const adminAuthSchema = { ...schema, rateLimits: schema.adminRateLimits }

const baseURL = resolveAdminAuthBaseUrl()
const secret = process.env.ADMIN_BETTER_AUTH_SECRET
if (!secret) {
  throw new Error('ADMIN_BETTER_AUTH_SECRET is required. The web auth secret must not be reused implicitly.')
}

export const auth = betterAuth({
  appName: 'Ogun Operasyon',
  database: drizzleAdapter(db, { provider: 'pg', usePlural: true, schema: adminAuthSchema }),
  secret,
  baseURL,
  trustedOrigins: [baseURL],
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
  },
  session: {
    modelName: 'adminSession',
    expiresIn: 60 * 60 * 8,
    updateAge: 60 * 60,
    freshAge: 60 * 10,
  },
  rateLimit: {
    enabled: true,
    storage: 'database',
    window: 60,
    max: 30,
    customRules: {
      '/sign-in/email': { window: 300, max: 5 },
      '/two-factor/*': { window: 300, max: 8 },
      '/forget-password': { window: 300, max: 3 },
      '/reset-password': { window: 300, max: 5 },
    },
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
        // Intentionally omit email, connection URLs, credentials and request metadata.
        // The classification tells operators whether production auth is querying
        // the production or staging database, without disclosing the DB hostname.
        console.warn('admin_sign_in_staff_check_denied', {
          databaseTarget: classifyAdminDatabaseTarget(process.env.DATABASE_URL),
          staffLookup: !email ? 'missing_email' : staff ? 'inactive' : 'not_found',
          deploymentEnvironment: process.env.VERCEL_ENV === 'production' ? 'production' : 'non_production',
        })
        throw new APIError('UNAUTHORIZED', { message: 'Giriş bilgileri doğrulanamadı.' })
      }
    }),
  },
  advanced: {
    cookiePrefix: 'ogun-admin',
    defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' },
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

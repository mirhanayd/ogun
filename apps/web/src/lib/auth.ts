import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'
import { db } from '@ogun/db'
import * as schema from '@ogun/db/schema'

// Better Auth kurulumu. Vercel'e özgü hiçbir API kullanılmıyor — düz Node.js
// üzerinde (Next.js App Router route handler'ı üzerinden) çalışır, bkz.
// apps/web/src/app/api/auth/[...all]/route.ts.
//
// Tablo adları çoğul (users, sessions, accounts, verifications) olduğu için
// usePlural: true veriyoruz; schema doğrudan packages/db/src/schema/tenancy.ts'ten.
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    usePlural: true,
    schema,
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // TODO: gerçek bir transactional e-posta sağlayıcısına (Resend, Postmark vb.)
    // bağla. Şimdilik geliştirme ortamında linki konsola yazar; MVP kapsamında
    // e-posta gönderim altyapısı bu prompt'un (3.1) kapsamı dışında.
    sendResetPassword: async ({ user, url }) => {
      console.info(`[auth] Şifre sıfırlama bağlantısı — ${user.email}: ${url}`)
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    },
  },
  // KURAL (bkz. src/lib/authz.ts): bir kullanıcı birden fazla klinikte üye
  // olabildiği için "şu an hangi klinikte çalışıyor" bilgisi oturuma
  // (session'a) bağlıdır, kullanıcıya değil. Bu iki alan clinic_members
  // üzerinden giriş/klinik değişimi sırasında set edilir (bkz. authz.ts
  // requireClinic / setActiveClinic).
  session: {
    additionalFields: {
      activeClinicId: {
        type: 'string',
        required: false,
      },
      role: {
        type: 'string',
        required: false,
      },
    },
  },
  // nextCookies() eklentisi, Better Auth eklenti listesinde SON sırada olmalı
  // (üst kütüphanenin kendi kuralı) — server action'lardan set-cookie
  // başlıklarını otomatik uygulamayı sağlar.
  plugins: [nextCookies()],
})

export type Auth = typeof auth

import { db } from '@ogun/db'
import * as schema from '@ogun/db/schema'
import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'
import { customSession } from 'better-auth/plugins'
import { and, eq } from 'drizzle-orm'

// Better Auth sunucu örneği.
//
// - Drizzle adapter, packages/db/src/schema/tenancy.ts içindeki users/sessions/
//   accounts/verifications tablolarına yazar (alan adları Better Auth'un
//   "core schema"sı ile birebir eşleşiyor, bkz. tenancy.ts başındaki not).
// - E-posta+şifre sağlayıcısı ve Google OAuth aktif.
// - customSession eklentisi, oturuma aktif kliniğin id'sini (activeClinicId,
//   session tablosunda saklanan bir alan) ve o klinikteki rolü (role, DB'den
//   her seferinde taze okunur, session'da denormalize edilmez) ekler.
const authOptions = {
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    },
  },
  session: {
    additionalFields: {
      // Kullanıcının o an aktif olarak çalıştığı klinik. Birden fazla
      // klinikte üye olabileceği için (bkz. clinic_members) hangi kliniğin
      // bağlamında işlem yaptığı oturumda tutulur; üst bardaki klinik
      // seçici bunu günceller (bkz. issue #11 uygulama kabuğu).
      activeClinicId: {
        type: 'string',
        required: false,
      },
    },
  },
  plugins: [
    customSession(async ({ user, session }) => {
      const activeClinicId = (session as { activeClinicId?: string | null }).activeClinicId ?? null

      const role = activeClinicId
        ? await db.query.clinicMembers
            .findFirst({
              where: and(
                eq(schema.clinicMembers.clinicId, activeClinicId),
                eq(schema.clinicMembers.userId, user.id),
              ),
              columns: { role: true },
            })
            .then((member) => member?.role ?? null)
        : null

      return {
        user,
        session: {
          ...session,
          activeClinicId,
          role,
        },
      }
    }),
    nextCookies(),
  ],
} satisfies BetterAuthOptions

// Dönüş tipi elle yazılıyor: betterAuth()'un çıkardığı tip, better-auth'un
// kendi iç zod v4 bağımlılığına referans veriyor ve bu, repo genelinde
// kullanılan zod v3 ile "portable olmayan tip" (TS2742) hatasına yol açıyor.
// `authOptions`'ı `satisfies BetterAuthOptions` ile ayrı tanımlayıp generic'i
// `ReturnType<typeof betterAuth<typeof authOptions>>` ile açıkça vererek hem
// TS2742'yi çözüyoruz hem de plugin/customSession'dan gelen özel dönüş tipini
// (activeClinicId, role) koruyoruz — sade `ReturnType<typeof betterAuth>`
// generic'i varsayılana düşürüp bu özel alanları kaybediyordu.
export const auth: ReturnType<typeof betterAuth<typeof authOptions>> = betterAuth(authOptions)

export type Auth = typeof auth

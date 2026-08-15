// Kimlik ve çok kiracılı yapı — users, clinics, clinic_members, Better Auth tabloları.
import { boolean, pgEnum, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { id, timestamps } from './_helpers'

export const clinicMemberRoleEnum = pgEnum('clinic_member_role', ['owner', 'dietitian', 'assistant'])
export type ClinicMemberRole = (typeof clinicMemberRoleEnum.enumValues)[number]

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'trialing',
  'active',
  'past_due',
  'canceled',
])

// Better Auth'un beklediği alan adlarıyla (email, name, image, emailVerified, ...)
// birebir uyumlu olacak şekilde tanımlanır — betterAuth() config'inde
// drizzleAdapter'a bu tablo doğrudan verilir, alan eşlemesi otomatik çalışır.
export const users = pgTable('users', {
  id: id(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  name: text('name').notNull(),
  image: text('image'),
  ...timestamps(),
})

// Bir diyetisyenlik kliniği — çok kiracılı yapının kök varlığı. Danışan (client)
// verisine dokunan HER tablo clinicId taşımalı (bkz. src/lib/authz.ts, apps/web).
export const clinics = pgTable('clinics', {
  id: id(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  logoUrl: text('logo_url'),
  primaryColor: text('primary_color'),
  phone: text('phone'),
  address: text('address'),
  taxId: text('tax_id'),
  subscriptionStatus: subscriptionStatusEnum('subscription_status').notNull().default('trialing'),
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
  ...timestamps(),
})

// Bir kullanıcının bir klinikteki üyeliği ve rolü. Aynı kullanıcı birden fazla
// klinikte üye olabilir (bkz. üst bar klinik seçici, Prompt 3.2).
export const clinicMembers = pgTable(
  'clinic_members',
  {
    id: id(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    role: clinicMemberRoleEnum('role').notNull(),
    invitedBy: text('invited_by').references(() => users.id),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    ...timestamps(),
  },
  (table) => [uniqueIndex('clinic_members_clinic_id_user_id_idx').on(table.clinicId, table.userId)],
)

// Better Auth — oturum tablosu. activeClinicId ve role, oturuma özel (custom
// session fields) alanlardır: kullanıcı birden çok klinikte üye olabildiği için
// "şu an hangi klinikte çalışıyor" bilgisi oturuma, kullanıcıya değil, bağlıdır.
export const sessions = pgTable('sessions', {
  id: id(),
  token: text('token').notNull().unique(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  activeClinicId: text('active_clinic_id').references(() => clinics.id),
  role: clinicMemberRoleEnum('role'),
  ...timestamps(),
})

// Better Auth — e-posta/şifre ve OAuth (Google) sağlayıcı hesapları.
export const accounts = pgTable('accounts', {
  id: id(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  ...timestamps(),
})

// Better Auth — e-posta doğrulama ve şifre sıfırlama tokenları.
export const verifications = pgTable('verifications', {
  id: id(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ...timestamps(),
})

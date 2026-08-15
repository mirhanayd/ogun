// Kimlik ve çok kiracılı yapı — users, clinics, clinic_members, Better Auth tabloları.
import { boolean, pgEnum, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { id, timestamps } from './_helpers'

// ---------------------------------------------------------------------------
// Better Auth çekirdek şeması.
//
// Alan adları ve tipler Better Auth'un Drizzle adapter'ının beklediği şemayla
// birebir uyumlu olmalı (bkz. better-auth "Core Schema" dokümantasyonu).
// Better Auth varsayılan olarak camelCase alan adları üretir; burada snake_case
// sütun adlarını Drizzle'ın ikinci argümanıyla eşliyoruz ki veritabanı repo
// genelindeki snake_case kuralına uysun, TypeScript tarafında yine camelCase
// kullanılır.
// ---------------------------------------------------------------------------

export const users = pgTable('users', {
  id: id(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  name: text('name').notNull(),
  image: text('image'),
  // Better Auth e-posta+şifre sağlayıcısı bu alanı `account` tablosunda tutar,
  // ancak "aktif klinik" gibi uygulamaya özgü oturum alanlarını burada,
  // users üzerinde tutuyoruz ki customSession eklentisi kolayca okuyabilsin.
  ...timestamps(),
})

export const sessions = pgTable('sessions', {
  id: id(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  // Custom session fields (bkz. apps/web/src/lib/auth.ts -> customSession).
  // Better Auth bu ek alanları da `session` tablosunda saklar.
  activeClinicId: text('active_clinic_id'),
  ...timestamps(),
})

export const accounts = pgTable('accounts', {
  id: id(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  idToken: text('id_token'),
  password: text('password'),
  ...timestamps(),
})

export const verifications = pgTable('verifications', {
  id: id(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ...timestamps(),
})

// ---------------------------------------------------------------------------
// Klinik / çok kiracılı yapı.
// ---------------------------------------------------------------------------

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'trialing',
  'active',
  'past_due',
  'canceled',
])

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

export const clinicMemberRoleEnum = pgEnum('clinic_member_role', [
  'owner',
  'dietitian',
  'assistant',
])

export const clinicMembers = pgTable(
  'clinic_members',
  {
    id: id(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: clinicMemberRoleEnum('role').notNull(),
    invitedBy: text('invited_by').references(() => users.id),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    ...timestamps(),
  },
  (table) => [uniqueIndex('clinic_members_clinic_id_user_id_idx').on(table.clinicId, table.userId)],
)

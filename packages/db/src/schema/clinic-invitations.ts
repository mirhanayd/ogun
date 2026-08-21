import { index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { id, timestamps } from './_helpers'
import { clinics, users } from './tenancy'

// Klinik yöneticisinin bir diyetisyene gönderdiği tek kullanımlık davet.
// Ham token hiçbir zaman veritabanına yazılmaz; yalnızca SHA-256 özeti tutulur.
// Böylece veritabanı içeriği sızsa bile aktif davet bağlantıları kullanılamaz.
export const clinicInvitations = pgTable(
  'clinic_invitations',
  {
    id: id(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    email: text('email').notNull(),
    name: text('name').notNull(),
    tokenHash: text('token_hash').notNull(),
    invitedBy: text('invited_by')
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    acceptedBy: text('accepted_by').references(() => users.id),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    // Yeniden gönderme aynı satırı ve yeni bir token'ı kullanır. Bu hem aktif
    // davet çoğalmasını hem de eski bağlantının geçerli kalmasını önler.
    uniqueIndex('clinic_invitations_clinic_id_email_idx').on(table.clinicId, table.email),
    uniqueIndex('clinic_invitations_token_hash_idx').on(table.tokenHash),
    index('clinic_invitations_clinic_id_created_at_idx').on(table.clinicId, table.createdAt.desc()),
  ],
)

export type ClinicInvitation = typeof clinicInvitations.$inferSelect

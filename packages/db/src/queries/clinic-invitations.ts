import { and, desc, eq, gt, isNull } from 'drizzle-orm'
import {
  accounts,
  clinicInvitations,
  clinicMembers,
  clinics,
  users,
  type ClinicMemberRole,
} from '../schema'
import type { Database } from '../client'

export interface UpsertClinicInvitationInput {
  email: string
  name: string
  tokenHash: string
  invitedBy: string
  expiresAt: Date
}

export function normalizeInvitationEmail(email: string): string {
  return email.trim().toLowerCase()
}

export async function isClinicMemberEmail(
  db: Database,
  clinicId: string,
  email: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: clinicMembers.id })
    .from(clinicMembers)
    .innerJoin(users, eq(users.id, clinicMembers.userId))
    .where(
      and(eq(clinicMembers.clinicId, clinicId), eq(users.email, normalizeInvitationEmail(email))),
    )
    .limit(1)
  return Boolean(row)
}

export async function upsertClinicInvitation(
  db: Database,
  clinicId: string,
  input: UpsertClinicInvitationInput,
) {
  const email = normalizeInvitationEmail(input.email)
  const [invitation] = await db
    .insert(clinicInvitations)
    .values({ clinicId, ...input, email })
    .onConflictDoUpdate({
      target: [clinicInvitations.clinicId, clinicInvitations.email],
      set: {
        name: input.name,
        tokenHash: input.tokenHash,
        invitedBy: input.invitedBy,
        expiresAt: input.expiresAt,
        acceptedAt: null,
        acceptedBy: null,
        revokedAt: null,
        updatedAt: new Date(),
      },
    })
    .returning()
  if (!invitation) throw new Error('Davet oluşturulamadı.')
  return invitation
}

export interface ClinicTeamMember {
  id: string
  userId: string
  name: string
  email: string
  role: 'owner' | 'dietitian' | 'assistant'
  joinedAt: Date
}

export interface PendingClinicInvitation {
  id: string
  name: string
  email: string
  expiresAt: Date
  createdAt: Date
  expired: boolean
}

export async function listClinicTeam(db: Database, clinicId: string, now = new Date()) {
  const [members, invitations] = await Promise.all([
    db
      .select({
        id: clinicMembers.id,
        userId: users.id,
        name: users.name,
        email: users.email,
        role: clinicMembers.role,
        joinedAt: clinicMembers.joinedAt,
      })
      .from(clinicMembers)
      .innerJoin(users, eq(users.id, clinicMembers.userId))
      .where(eq(clinicMembers.clinicId, clinicId))
      .orderBy(users.name),
    db
      .select({
        id: clinicInvitations.id,
        name: clinicInvitations.name,
        email: clinicInvitations.email,
        expiresAt: clinicInvitations.expiresAt,
        createdAt: clinicInvitations.createdAt,
      })
      .from(clinicInvitations)
      .where(
        and(
          eq(clinicInvitations.clinicId, clinicId),
          isNull(clinicInvitations.acceptedAt),
          isNull(clinicInvitations.revokedAt),
        ),
      )
      .orderBy(desc(clinicInvitations.createdAt)),
  ])

  return {
    members: members as ClinicTeamMember[],
    invitations: invitations.map((invitation) => ({
      ...invitation,
      expired: invitation.expiresAt <= now,
    })) satisfies PendingClinicInvitation[],
  }
}

export async function getClinicTeamMemberById(db: Database, clinicId: string, memberId: string) {
  const [member] = await db
    .select({
      id: clinicMembers.id,
      userId: clinicMembers.userId,
      role: clinicMembers.role,
    })
    .from(clinicMembers)
    .where(and(eq(clinicMembers.id, memberId), eq(clinicMembers.clinicId, clinicId)))
    .limit(1)
  return member ?? null
}

export async function updateClinicTeamMemberRole(
  db: Database,
  clinicId: string,
  memberId: string,
  role: ClinicMemberRole,
) {
  const [member] = await db
    .update(clinicMembers)
    .set({ role })
    .where(and(eq(clinicMembers.id, memberId), eq(clinicMembers.clinicId, clinicId)))
    .returning({ id: clinicMembers.id, userId: clinicMembers.userId, role: clinicMembers.role })
  return member ?? null
}

export async function deleteClinicTeamMember(db: Database, clinicId: string, memberId: string) {
  const [member] = await db
    .delete(clinicMembers)
    .where(and(eq(clinicMembers.id, memberId), eq(clinicMembers.clinicId, clinicId)))
    .returning({ id: clinicMembers.id, userId: clinicMembers.userId, role: clinicMembers.role })
  return member ?? null
}

export interface InvitationPreview {
  id: string
  name: string
  email: string
  clinicName: string
  inviterName: string
  expiresAt: Date
  accountExists: boolean
  requiresPassword: boolean
}

export async function getActiveInvitationByTokenHash(
  db: Database,
  tokenHash: string,
  now = new Date(),
): Promise<InvitationPreview | null> {
  const [row] = await db
    .select({
      id: clinicInvitations.id,
      name: clinicInvitations.name,
      email: clinicInvitations.email,
      clinicName: clinics.name,
      inviterName: users.name,
      expiresAt: clinicInvitations.expiresAt,
    })
    .from(clinicInvitations)
    .innerJoin(clinics, eq(clinics.id, clinicInvitations.clinicId))
    .innerJoin(users, eq(users.id, clinicInvitations.invitedBy))
    .where(
      and(
        eq(clinicInvitations.tokenHash, tokenHash),
        isNull(clinicInvitations.acceptedAt),
        isNull(clinicInvitations.revokedAt),
        gt(clinicInvitations.expiresAt, now),
      ),
    )
    .limit(1)
  if (!row) return null

  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, row.email))
    .limit(1)
  const [credentialAccount] = existingUser
    ? await db
        .select({ id: accounts.id, password: accounts.password })
        .from(accounts)
        .where(and(eq(accounts.userId, existingUser.id), eq(accounts.providerId, 'credential')))
        .limit(1)
    : []
  return {
    ...row,
    accountExists: Boolean(existingUser),
    // Google gibi bir sağlayıcıyla oluşturulmuş mevcut hesabın credential
    // kaydı olmayabilir. Davet URL'si bu durumda da şifre oluşturma akışını
    // sunar; mevcut sosyal giriş bağlantısına dokunulmaz.
    requiresPassword: !credentialAccount?.password,
  }
}

export interface AcceptClinicInvitationInput {
  tokenHash: string
  // Credential hesabı olmayan kullanıcı için Better Auth'un kendi
  // algoritmasıyla üretilmiş hash. Mevcut şifreli hesaba dokunulmaz.
  passwordHash: string | null
}

export async function acceptClinicInvitation(
  db: Database,
  input: AcceptClinicInvitationInput,
  now = new Date(),
): Promise<{ userId: string; clinicId: string; accountCreated: boolean } | null> {
  return db.transaction(async (tx) => {
    // Koşullu UPDATE token'ı atomik biçimde tüketir. Aynı bağlantıya iki kez
    // basılması halinde yalnızca ilk transaction devam edebilir.
    const [invitation] = await tx
      .update(clinicInvitations)
      .set({ acceptedAt: now, updatedAt: now })
      .where(
        and(
          eq(clinicInvitations.tokenHash, input.tokenHash),
          isNull(clinicInvitations.acceptedAt),
          isNull(clinicInvitations.revokedAt),
          gt(clinicInvitations.expiresAt, now),
        ),
      )
      .returning()
    if (!invitation) return null

    // Aynı sosyal hesabın iki klinik daveti eşzamanlı kabul edilirse credential
    // kontrol/insert zincirini kullanıcı satırı üzerinde seri hale getirir.
    let [user] = await tx
      .select()
      .from(users)
      .where(eq(users.email, invitation.email))
      .limit(1)
      .for('update')
    let accountCreated = false

    if (!user) {
      ;[user] = await tx
        .insert(users)
        .values({
          name: invitation.name,
          email: invitation.email,
          // Tek kullanımlık davet token'ı e-posta kutusuna erişimi doğrular.
          emailVerified: true,
        })
        .returning()
      if (!user) throw new Error('Diyetisyen hesabı oluşturulamadı.')
      accountCreated = true
    }

    if (!user.emailVerified) {
      await tx
        .update(users)
        .set({ emailVerified: true, updatedAt: now })
        .where(eq(users.id, user.id))
    }

    const [credentialAccount] = await tx
      .select({ id: accounts.id, password: accounts.password })
      .from(accounts)
      .where(and(eq(accounts.userId, user.id), eq(accounts.providerId, 'credential')))
      .limit(1)
    if (!credentialAccount?.password) {
      if (!input.passwordHash) {
        throw new Error('Şifre oluşturmak zorunludur.')
      }
      if (credentialAccount) {
        await tx
          .update(accounts)
          .set({ password: input.passwordHash, updatedAt: now })
          .where(eq(accounts.id, credentialAccount.id))
      } else {
        await tx.insert(accounts).values({
          userId: user.id,
          accountId: user.id,
          providerId: 'credential',
          password: input.passwordHash,
        })
      }
    }

    await tx
      .insert(clinicMembers)
      .values({
        clinicId: invitation.clinicId,
        userId: user.id,
        role: 'dietitian',
        invitedBy: invitation.invitedBy,
      })
      .onConflictDoNothing({ target: [clinicMembers.clinicId, clinicMembers.userId] })

    await tx
      .update(clinicInvitations)
      .set({ acceptedBy: user.id, updatedAt: now })
      .where(eq(clinicInvitations.id, invitation.id))

    return { userId: user.id, clinicId: invitation.clinicId, accountCreated }
  })
}

export async function revokeClinicInvitation(db: Database, clinicId: string, invitationId: string) {
  const now = new Date()
  const [invitation] = await db
    .update(clinicInvitations)
    .set({ revokedAt: now, updatedAt: now })
    .where(
      and(
        eq(clinicInvitations.id, invitationId),
        eq(clinicInvitations.clinicId, clinicId),
        isNull(clinicInvitations.acceptedAt),
      ),
    )
    .returning({ id: clinicInvitations.id })
  return invitation ?? null
}

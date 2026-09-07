import { and, count, desc, eq, gt, sql } from 'drizzle-orm'
import type { Database } from '../client'
import {
  adminSessions,
  clinics,
  platformAuditLogs,
  platformStaff,
  users,
  type PlatformAuditOutcome,
  type PlatformStaffRole,
} from '../schema'

export interface PlatformAuditLogInput {
  actorUserId: string | null
  platformStaffId: string | null
  action: string
  entityType: string
  entityId?: string | null
  clinicId?: string | null
  outcome: PlatformAuditOutcome
  reason?: string | null
  ipAddress?: string | null
  userAgent?: string | null
  metadata?: Record<string, unknown>
}

export function insertPlatformAuditLog(db: Database, input: PlatformAuditLogInput) {
  return db
    .insert(platformAuditLogs)
    .values({
      ...input,
      entityId: input.entityId ?? null,
      clinicId: input.clinicId ?? null,
      reason: input.reason ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    })
    .returning()
    .then(([row]) => {
      if (!row) throw new Error('Platform denetim kaydı oluşturulamadı.')
      return row
    })
}

export async function getPlatformStaffByUserId(db: Database, userId: string) {
  const [row] = await db
    .select({
      id: platformStaff.id,
      userId: platformStaff.userId,
      role: platformStaff.role,
      isActive: platformStaff.isActive,
      deactivatedAt: platformStaff.deactivatedAt,
    })
    .from(platformStaff)
    .where(eq(platformStaff.userId, userId))
    .limit(1)
  return row ?? null
}

export async function getPlatformStaffByEmail(db: Database, email: string) {
  const [row] = await db
    .select({
      id: platformStaff.id,
      userId: platformStaff.userId,
      role: platformStaff.role,
      isActive: platformStaff.isActive,
    })
    .from(platformStaff)
    .innerJoin(users, eq(users.id, platformStaff.userId))
    .where(sql`lower(${users.email}) = ${email.trim().toLowerCase()}`)
    .limit(1)
  return row ?? null
}

export async function listPlatformStaff(db: Database) {
  return db
    .select({
      id: platformStaff.id,
      userId: platformStaff.userId,
      name: users.name,
      email: users.email,
      role: platformStaff.role,
      isActive: platformStaff.isActive,
      createdAt: platformStaff.createdAt,
      deactivatedAt: platformStaff.deactivatedAt,
    })
    .from(platformStaff)
    .innerJoin(users, eq(users.id, platformStaff.userId))
    .orderBy(desc(platformStaff.createdAt))
}

export async function listPlatformAuditLogs(db: Database, page = 1, pageSize = 50) {
  const safePage = Math.max(1, Math.trunc(page))
  const safePageSize = Math.min(100, Math.max(1, Math.trunc(pageSize)))
  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: platformAuditLogs.id,
        createdAt: platformAuditLogs.createdAt,
        actorName: users.name,
        actorEmail: users.email,
        action: platformAuditLogs.action,
        entityType: platformAuditLogs.entityType,
        entityId: platformAuditLogs.entityId,
        clinicId: platformAuditLogs.clinicId,
        outcome: platformAuditLogs.outcome,
        reason: platformAuditLogs.reason,
        ipAddress: platformAuditLogs.ipAddress,
        userAgent: platformAuditLogs.userAgent,
        metadata: platformAuditLogs.metadata,
      })
      .from(platformAuditLogs)
      .leftJoin(users, eq(users.id, platformAuditLogs.actorUserId))
      .orderBy(desc(platformAuditLogs.createdAt))
      .limit(safePageSize)
      .offset((safePage - 1) * safePageSize),
    db.select({ total: count() }).from(platformAuditLogs),
  ])
  return { rows, total: totalRow?.total ?? 0, page: safePage, pageSize: safePageSize }
}

export async function getPlatformDashboardSummary(db: Database) {
  const now = new Date()
  const [[clinicTotal], [userTotal], [staffTotal], [sessionTotal]] = await Promise.all([
    db.select({ value: count() }).from(clinics),
    db.select({ value: count() }).from(users),
    db.select({ value: count() }).from(platformStaff).where(eq(platformStaff.isActive, true)),
    db.select({ value: count() }).from(adminSessions).where(gt(adminSessions.expiresAt, now)),
  ])
  return {
    clinics: clinicTotal?.value ?? 0,
    users: userTotal?.value ?? 0,
    activeStaff: staffTotal?.value ?? 0,
    activeAdminSessions: sessionTotal?.value ?? 0,
  }
}

export async function grantPlatformStaff(
  db: Database,
  input: { email: string; role: PlatformStaffRole },
) {
  const normalizedEmail = input.email.trim().toLowerCase()
  return db.transaction(async (tx) => {
    const [user] = await tx
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(sql`lower(${users.email}) = ${normalizedEmail}`)
      .limit(1)
    if (!user) throw new Error(`Kullanıcı bulunamadı: ${normalizedEmail}`)

    const [staff] = await tx
      .insert(platformStaff)
      .values({ userId: user.id, role: input.role, isActive: true, deactivatedAt: null })
      .onConflictDoUpdate({
        target: platformStaff.userId,
        set: { role: input.role, isActive: true, deactivatedAt: null, updatedAt: new Date() },
      })
      .returning()

    if (!staff) throw new Error('Platform personeli kaydı oluşturulamadı.')
    await tx.insert(platformAuditLogs).values({
      actorUserId: null,
      platformStaffId: null,
      action: 'platform_staff.grant',
      entityType: 'platform_staff',
      entityId: staff.id,
      outcome: 'success',
      metadata: { source: 'bootstrap_cli', targetUserId: user.id, role: input.role },
    })
    return { user, staff }
  })
}

export async function revokePlatformStaff(db: Database, email: string) {
  const normalizedEmail = email.trim().toLowerCase()
  return db.transaction(async (tx) => {
    const [record] = await tx
      .select({ staffId: platformStaff.id, userId: users.id, isActive: platformStaff.isActive })
      .from(platformStaff)
      .innerJoin(users, eq(users.id, platformStaff.userId))
      .where(sql`lower(${users.email}) = ${normalizedEmail}`)
      .limit(1)
    if (!record) throw new Error(`Platform personeli bulunamadı: ${normalizedEmail}`)

    const now = new Date()
    await tx
      .update(platformStaff)
      .set({ isActive: false, deactivatedAt: now, updatedAt: now })
      .where(and(eq(platformStaff.id, record.staffId), eq(platformStaff.isActive, true)))
    await tx.delete(adminSessions).where(eq(adminSessions.userId, record.userId))
    await tx.insert(platformAuditLogs).values({
      actorUserId: null,
      platformStaffId: null,
      action: 'platform_staff.revoke',
      entityType: 'platform_staff',
      entityId: record.staffId,
      outcome: 'success',
      metadata: { source: 'bootstrap_cli', targetUserId: record.userId },
    })
    return { ...record, alreadyInactive: !record.isActive }
  })
}

import { and, count, desc, eq, gt, ilike, inArray, isNotNull, max, or, sql } from 'drizzle-orm'
import type { Database } from '../client'
import {
  adminSessions,
  clinicMembers,
  clinics,
  deviceSessions,
  devices,
  deviceUserLinks,
  platformAuditLogs,
  sessions,
  subscriptions,
  users,
  type DeviceStatus,
  type PlatformAuditOutcome,
  type SubscriptionBillingCycle,
  type SubscriptionPlan,
  type SubscriptionStatus,
} from '../schema'

export interface PlatformClinicFilters {
  search?: string
  plan?: SubscriptionPlan
  status?: SubscriptionStatus
  billingCycle?: SubscriptionBillingCycle
  onboarding?: 'complete' | 'incomplete'
  page?: number
  pageSize?: 25 | 50 | 100
}

function clinicConditions(filters: PlatformClinicFilters) {
  const conditions = []
  const search = filters.search?.trim()
  if (search) conditions.push(or(ilike(clinics.name, `%${search}%`), ilike(clinics.slug, `%${search}%`))!)
  if (filters.plan) conditions.push(eq(subscriptions.planCode, filters.plan))
  if (filters.status) conditions.push(eq(clinics.subscriptionStatus, filters.status))
  if (filters.billingCycle) conditions.push(eq(subscriptions.billingCycle, filters.billingCycle))
  if (filters.onboarding === 'complete') conditions.push(isNotNull(clinics.onboardingCompletedAt))
  if (filters.onboarding === 'incomplete') conditions.push(sql`${clinics.onboardingCompletedAt} is null`)
  return conditions.length ? and(...conditions) : undefined
}

export async function listClinicsForPlatform(db: Database, filters: PlatformClinicFilters = {}) {
  const requestedPage = Math.trunc(filters.page ?? 1)
  const page = Number.isFinite(requestedPage) ? Math.max(1, requestedPage) : 1
  const pageSize = ([25, 50, 100] as const).includes(filters.pageSize as 25 | 50 | 100)
    ? filters.pageSize!
    : 25
  const where = clinicConditions(filters)
  const memberCount = sql<number>`(
    select count(*)::int from ${clinicMembers} cm where cm.clinic_id = ${clinics.id}
  )`
  const lastSessionActivity = sql<Date | null>`(
    select max(greatest(s.created_at, s.updated_at)) from ${sessions} s where s.active_clinic_id = ${clinics.id}
  )`
  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: clinics.id,
        name: clinics.name,
        slug: clinics.slug,
        planCode: subscriptions.planCode,
        subscriptionStatus: clinics.subscriptionStatus,
        billingCycle: subscriptions.billingCycle,
        memberCount,
        onboardingCompletedAt: clinics.onboardingCompletedAt,
        lastSessionActivity,
        createdAt: clinics.createdAt,
      })
      .from(clinics)
      .leftJoin(subscriptions, eq(subscriptions.clinicId, clinics.id))
      .where(where)
      .orderBy(desc(clinics.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ total: count() })
      .from(clinics)
      .leftJoin(subscriptions, eq(subscriptions.clinicId, clinics.id))
      .where(where),
  ])
  return { rows, total: totalRow?.total ?? 0, page, pageSize }
}

export async function getClinicForPlatform(db: Database, clinicId: string) {
  const [row] = await db
    .select({
      id: clinics.id,
      name: clinics.name,
      slug: clinics.slug,
      phone: clinics.phone,
      address: clinics.address,
      taxId: clinics.taxId,
      subscriptionStatus: clinics.subscriptionStatus,
      trialEndsAt: clinics.trialEndsAt,
      onboardingStep: clinics.onboardingStep,
      onboardingCompletedAt: clinics.onboardingCompletedAt,
      createdAt: clinics.createdAt,
      planCode: subscriptions.planCode,
      billingCycle: subscriptions.billingCycle,
      provider: subscriptions.provider,
      currentPeriodStart: subscriptions.currentPeriodStart,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
    })
    .from(clinics)
    .leftJoin(subscriptions, eq(subscriptions.clinicId, clinics.id))
    .where(eq(clinics.id, clinicId))
    .limit(1)
  if (!row) return null
  const [memberTotal] = await db.select({ value: count() }).from(clinicMembers).where(eq(clinicMembers.clinicId, clinicId))
  return { ...row, memberCount: memberTotal?.value ?? 0 }
}

export async function listClinicMembersForPlatform(db: Database, clinicId: string) {
  return db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      emailVerified: users.emailVerified,
      role: clinicMembers.role,
      joinedAt: clinicMembers.joinedAt,
      activeSessionCount: sql<number>`count(distinct ${sessions.id})::int`,
      lastSessionAt: max(sessions.updatedAt),
      deviceCount: sql<number>`count(distinct ${deviceUserLinks.deviceId})::int`,
    })
    .from(clinicMembers)
    .innerJoin(users, eq(users.id, clinicMembers.userId))
    .leftJoin(sessions, and(eq(sessions.userId, users.id), gt(sessions.expiresAt, new Date())))
    .leftJoin(deviceUserLinks, eq(deviceUserLinks.userId, users.id))
    .where(eq(clinicMembers.clinicId, clinicId))
    .groupBy(users.id, users.name, users.email, users.emailVerified, clinicMembers.role, clinicMembers.joinedAt)
    .orderBy(users.name)
}

export async function listClinicSessionsForPlatform(db: Database, clinicId: string) {
  return db
    .select({
      id: sessions.id,
      userId: sessions.userId,
      userName: users.name,
      userEmail: users.email,
      createdAt: sessions.createdAt,
      updatedAt: sessions.updatedAt,
      expiresAt: sessions.expiresAt,
      activeClinicId: sessions.activeClinicId,
      role: sessions.role,
      ipAddress: sessions.ipAddress,
      userAgent: sessions.userAgent,
      deviceId: deviceSessions.deviceId,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .leftJoin(deviceSessions, eq(deviceSessions.sessionId, sessions.id))
    .where(eq(sessions.activeClinicId, clinicId))
    .orderBy(desc(sessions.updatedAt))
}

export async function getUserForPlatform(db: Database, userId: string) {
  const [user] = await db
    .select({ id: users.id, name: users.name, email: users.email, emailVerified: users.emailVerified, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  if (!user) return null
  const memberships = await db
    .select({ clinicId: clinics.id, clinicName: clinics.name, clinicSlug: clinics.slug, role: clinicMembers.role, joinedAt: clinicMembers.joinedAt })
    .from(clinicMembers)
    .innerJoin(clinics, eq(clinics.id, clinicMembers.clinicId))
    .where(eq(clinicMembers.userId, userId))
    .orderBy(clinics.name)
  return { ...user, memberships }
}

export async function listUserSessionsForPlatform(db: Database, userId: string) {
  return db
    .select({
      id: sessions.id,
      createdAt: sessions.createdAt,
      updatedAt: sessions.updatedAt,
      expiresAt: sessions.expiresAt,
      activeClinicId: sessions.activeClinicId,
      role: sessions.role,
      ipAddress: sessions.ipAddress,
      userAgent: sessions.userAgent,
      deviceId: deviceSessions.deviceId,
    })
    .from(sessions)
    .leftJoin(deviceSessions, eq(deviceSessions.sessionId, sessions.id))
    .where(eq(sessions.userId, userId))
    .orderBy(desc(sessions.updatedAt))
}

const deviceProjection = {
  id: devices.id,
  fingerprint: sql<string>`upper(substr(${devices.installationIdHash}, 1, 10))`,
  platform: devices.platform,
  displayName: devices.displayName,
  appVersion: devices.appVersion,
  firstSeenAt: devices.firstSeenAt,
  lastSeenAt: devices.lastSeenAt,
  lastIpAddress: devices.lastIpAddress,
  status: devices.status,
  revokedAt: devices.revokedAt,
  revokedReason: devices.revokedReason,
} as const

export async function listClinicDevicesForPlatform(db: Database, clinicId: string) {
  return db
    .select({
      ...deviceProjection,
      users: sql<string>`string_agg(distinct ${users.name} || ' <' || ${users.email} || '>', ', ')`,
    })
    .from(devices)
    .innerJoin(deviceUserLinks, eq(deviceUserLinks.deviceId, devices.id))
    .innerJoin(users, eq(users.id, deviceUserLinks.userId))
    .innerJoin(clinicMembers, and(eq(clinicMembers.userId, users.id), eq(clinicMembers.clinicId, clinicId)))
    .groupBy(...Object.values(deviceProjection))
    .orderBy(desc(devices.lastSeenAt))
}

export async function listUserDevicesForPlatform(db: Database, userId: string) {
  return db
    .select({
      ...deviceProjection,
      activeSessionCount: sql<number>`count(distinct case when ${sessions.expiresAt} > now() then ${sessions.id} end)::int`,
    })
    .from(deviceUserLinks)
    .innerJoin(devices, eq(devices.id, deviceUserLinks.deviceId))
    .leftJoin(deviceSessions, eq(deviceSessions.deviceId, devices.id))
    .leftJoin(sessions, and(eq(sessions.id, deviceSessions.sessionId), eq(sessions.userId, userId)))
    .where(eq(deviceUserLinks.userId, userId))
    .groupBy(...Object.values(deviceProjection))
    .orderBy(desc(devices.lastSeenAt))
}

export interface PlatformMutationActor {
  actorUserId: string
  platformStaffId: string
  ipAddress?: string | null
  userAgent?: string | null
}

function successAudit(actor: PlatformMutationActor, input: {
  action: string
  entityType: string
  entityId: string
  clinicId?: string | null
  reason?: string | null
  metadata?: Record<string, unknown>
}) {
  return {
    actorUserId: actor.actorUserId,
    platformStaffId: actor.platformStaffId,
    outcome: 'success' as const,
    ipAddress: actor.ipAddress ?? null,
    userAgent: actor.userAgent ?? null,
    clinicId: input.clinicId ?? null,
    reason: input.reason ?? null,
    metadata: input.metadata,
    ...input,
  }
}

export async function revokeUserSessionForPlatform(db: Database, input: PlatformMutationActor & {
  userId: string
  sessionId: string
  clinicId?: string | null
}) {
  return db.transaction(async (tx) => {
    if (input.clinicId) {
      const [membership] = await tx.select({ id: clinicMembers.id }).from(clinicMembers)
        .where(and(eq(clinicMembers.clinicId, input.clinicId), eq(clinicMembers.userId, input.userId))).limit(1)
      if (!membership) throw new Error('Kullanıcı klinik üyesi değil.')
    }
    const [removed] = await tx.delete(sessions)
      .where(and(eq(sessions.id, input.sessionId), eq(sessions.userId, input.userId))).returning({ id: sessions.id })
    if (!removed) throw new Error('Normal kullanıcı oturumu bulunamadı.')
    await tx.insert(platformAuditLogs).values(successAudit(input, {
      action: 'user.session.revoked', entityType: 'session', entityId: removed.id,
      clinicId: input.clinicId, metadata: { targetUserId: input.userId },
    }))
    return removed
  })
}

export async function revokeAllUserSessionsForPlatform(db: Database, input: PlatformMutationActor & {
  userId: string
  clinicId?: string | null
}) {
  return db.transaction(async (tx) => {
    if (input.clinicId) {
      const [membership] = await tx.select({ id: clinicMembers.id }).from(clinicMembers)
        .where(and(eq(clinicMembers.clinicId, input.clinicId), eq(clinicMembers.userId, input.userId))).limit(1)
      if (!membership) throw new Error('Kullanıcı klinik üyesi değil.')
    }
    const removed = await tx.delete(sessions).where(eq(sessions.userId, input.userId)).returning({ id: sessions.id })
    await tx.insert(platformAuditLogs).values(successAudit(input, {
      action: 'user.sessions.revoked_all', entityType: 'user', entityId: input.userId,
      clinicId: input.clinicId, metadata: { revokedSessionCount: removed.length },
    }))
    return { count: removed.length }
  })
}

export async function revokeDeviceForPlatform(db: Database, input: PlatformMutationActor & {
  deviceId: string
  reason: string
  clinicId?: string | null
}) {
  return db.transaction(async (tx) => {
    const [device] = input.clinicId
      ? await tx.select({ id: devices.id }).from(devices)
        .innerJoin(deviceUserLinks, eq(deviceUserLinks.deviceId, devices.id))
        .innerJoin(clinicMembers, and(eq(clinicMembers.userId, deviceUserLinks.userId), eq(clinicMembers.clinicId, input.clinicId)))
        .where(eq(devices.id, input.deviceId)).limit(1)
      : await tx.select({ id: devices.id }).from(devices).where(eq(devices.id, input.deviceId)).limit(1)
    if (!device) throw new Error('Cihaz bulunamadı.')
    const bound = await tx.select({ sessionId: deviceSessions.sessionId }).from(deviceSessions).where(eq(deviceSessions.deviceId, device.id))
    if (bound.length) await tx.delete(sessions).where(inArray(sessions.id, bound.map((row) => row.sessionId)))
    const now = new Date()
    await tx.update(devices).set({ status: 'revoked', revokedAt: now, revokedByPlatformStaffId: input.platformStaffId, revokedReason: input.reason, updatedAt: now }).where(eq(devices.id, device.id))
    await tx.insert(platformAuditLogs).values(successAudit(input, {
      action: 'device.revoked', entityType: 'device', entityId: device.id, clinicId: input.clinicId,
      reason: input.reason, metadata: { revokedSessionCount: bound.length },
    }))
    return { id: device.id, revokedSessionCount: bound.length }
  })
}

export async function reactivateDeviceForPlatform(db: Database, input: PlatformMutationActor & {
  deviceId: string
  clinicId?: string | null
}) {
  return db.transaction(async (tx) => {
    if (input.clinicId) {
      const [visible] = await tx.select({ id: devices.id }).from(devices)
        .innerJoin(deviceUserLinks, eq(deviceUserLinks.deviceId, devices.id))
        .innerJoin(clinicMembers, and(eq(clinicMembers.userId, deviceUserLinks.userId), eq(clinicMembers.clinicId, input.clinicId)))
        .where(eq(devices.id, input.deviceId)).limit(1)
      if (!visible) throw new Error('Cihaz klinik kapsamında bulunamadı.')
    }
    const [device] = await tx.update(devices).set({ status: 'active', revokedAt: null, revokedByPlatformStaffId: null, revokedReason: null, updatedAt: new Date() })
      .where(eq(devices.id, input.deviceId)).returning({ id: devices.id })
    if (!device) throw new Error('Cihaz bulunamadı.')
    await tx.insert(platformAuditLogs).values(successAudit(input, {
      action: 'device.reactivated', entityType: 'device', entityId: device.id, clinicId: input.clinicId,
    }))
    return device
  })
}

export const DEVICE_LAST_SEEN_THROTTLE_MS = 10 * 60 * 1000

export async function registerDesktopDevice(db: Database, input: {
  installationIdHash: string
  userId: string
  sessionId: string
  platform: string
  displayName: string
  appVersion: string
  ipAddress?: string | null
  now?: Date
}) {
  const now = input.now ?? new Date()
  return db.transaction(async (tx) => {
    const [created] = await tx.insert(devices).values({
      installationIdHash: input.installationIdHash,
      platform: input.platform,
      displayName: input.displayName,
      appVersion: input.appVersion,
      firstSeenAt: now,
      lastSeenAt: now,
      lastIpAddress: input.ipAddress ?? null,
    }).onConflictDoNothing({ target: devices.installationIdHash }).returning({ id: devices.id, status: devices.status })
    const [device] = created ? [created] : await tx.select({ id: devices.id, status: devices.status, lastSeenAt: devices.lastSeenAt })
      .from(devices).where(eq(devices.installationIdHash, input.installationIdHash)).limit(1)
    if (!device) throw new Error('Cihaz kaydı oluşturulamadı.')
    if (device.status === 'revoked') return { id: device.id, status: device.status, created: false }

    if (created) {
      await tx.insert(platformAuditLogs).values({
        actorUserId: input.userId,
        platformStaffId: null,
        action: 'device.registered',
        entityType: 'device',
        entityId: device.id,
        outcome: 'success',
        ipAddress: input.ipAddress ?? null,
        metadata: { platform: input.platform, appVersion: input.appVersion },
      })
    }

    const shouldTouch = created || !('lastSeenAt' in device) || now.getTime() - device.lastSeenAt.getTime() >= DEVICE_LAST_SEEN_THROTTLE_MS
    if (shouldTouch && !created) {
      await tx.update(devices).set({ platform: input.platform, displayName: input.displayName, appVersion: input.appVersion, lastSeenAt: now, lastIpAddress: input.ipAddress ?? null, updatedAt: now }).where(eq(devices.id, device.id))
    }
    const linkInsert = tx.insert(deviceUserLinks).values({ deviceId: device.id, userId: input.userId, firstSeenAt: now, lastSeenAt: now })
    if (shouldTouch) await linkInsert.onConflictDoUpdate({ target: [deviceUserLinks.deviceId, deviceUserLinks.userId], set: { lastSeenAt: now } })
    else await linkInsert.onConflictDoNothing({ target: [deviceUserLinks.deviceId, deviceUserLinks.userId] })
    const sessionInsert = tx.insert(deviceSessions).values({ deviceId: device.id, sessionId: input.sessionId, createdAt: now, lastSeenAt: now })
    if (shouldTouch) await sessionInsert.onConflictDoUpdate({ target: deviceSessions.sessionId, set: { deviceId: device.id, lastSeenAt: now } })
    else await sessionInsert.onConflictDoNothing({ target: deviceSessions.sessionId })
    return { id: device.id, status: 'active' as const, created: Boolean(created) }
  })
}

export async function getDeviceStatusByInstallationHash(db: Database, installationIdHash: string): Promise<DeviceStatus | null> {
  const [row] = await db.select({ status: devices.status }).from(devices).where(eq(devices.installationIdHash, installationIdHash)).limit(1)
  return row?.status ?? null
}

/** User-facing device lookup. Platform-wide device reads use the separate,
 * permission-gated platform operations; ordinary identities must match the
 * link table as well as the opaque device id. */
export async function getDeviceForUser(db: Database, userId: string, deviceId: string) {
  const [row] = await db
    .select({ id: devices.id, status: devices.status, displayName: devices.displayName })
    .from(devices)
    .innerJoin(deviceUserLinks, eq(deviceUserLinks.deviceId, devices.id))
    .where(and(eq(devices.id, deviceId), eq(deviceUserLinks.userId, userId)))
    .limit(1)
  return row ?? null
}

export async function hasRecentPasswordResetRequest(db: Database, userId: string, since: Date) {
  const [row] = await db.select({ id: platformAuditLogs.id }).from(platformAuditLogs)
    .where(and(eq(platformAuditLogs.entityType, 'user'), eq(platformAuditLogs.entityId, userId), eq(platformAuditLogs.action, 'user.password_reset.requested'), eq(platformAuditLogs.outcome, 'success'), gt(platformAuditLogs.createdAt, since)))
    .limit(1)
  return Boolean(row)
}

export async function countAdminSessionsForUser(db: Database, userId: string) {
  const [row] = await db.select({ value: count() }).from(adminSessions).where(eq(adminSessions.userId, userId))
  return row?.value ?? 0
}

export type PlatformOperationAuditOutcome = PlatformAuditOutcome

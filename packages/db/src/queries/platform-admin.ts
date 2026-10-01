import { and, count, desc, eq, gt, isNull, sql } from 'drizzle-orm'
import type { Database } from '../client'
import {
  adminSessions,
  clients,
  clinics,
  platformAuditLogs,
  platformStaff,
  subscriptions,
  supportTickets,
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

const DAY_MS = 24 * 60 * 60 * 1000

function monthKeys(now: Date, count = 6) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (count - index - 1), 1))
    return {
      key: date.toISOString().slice(0, 7),
      label: new Intl.DateTimeFormat('tr-TR', { month: 'short' }).format(date),
    }
  })
}

function periodValues(row: { current: number; previous: number } | undefined) {
  return { current: row?.current ?? 0, previous: row?.previous ?? 0 }
}

/**
 * Platform dashboard analytics are derived only from canonical operational
 * tables. The fixed 30-day comparison keeps every KPI on the same baseline;
 * no billing revenue is inferred from plan definitions or subscription state.
 */
export async function getPlatformDashboardAnalytics(db: Database, now = new Date()) {
  const currentStart = new Date(now.getTime() - 30 * DAY_MS)
  const previousStart = new Date(now.getTime() - 60 * DAY_MS)
  const months = monthKeys(now)
  const seriesStart = new Date(`${months[0]!.key}-01T00:00:00.000Z`)
  // Raw SQL fragments are serialized by the postgres driver separately from
  // Drizzle's typed filters; pass ISO strings rather than Date instances.
  const currentStartIso = currentStart.toISOString()
  const previousStartIso = previousStart.toISOString()
  const seriesStartIso = seriesStart.toISOString()

  const clinicMonth = sql<string>`to_char(date_trunc('month', ${clinics.createdAt}), 'YYYY-MM')`
  const userMonth = sql<string>`to_char(date_trunc('month', ${users.createdAt}), 'YYYY-MM')`
  const clientMonth = sql<string>`to_char(date_trunc('month', ${clients.createdAt}), 'YYYY-MM')`
  const ticketMonth = sql<string>`to_char(date_trunc('month', ${supportTickets.createdAt}), 'YYYY-MM')`

  const [
    [clinicGrowth],
    [userGrowth],
    [clientGrowth],
    [ticketGrowth],
    [clientTotals],
    [ticketTotals],
    [onboardingTotals],
    subscriptionStatuses,
    planDistribution,
    clinicSeries,
    userSeries,
    clientSeries,
    ticketSeries,
    recentActivity,
  ] = await Promise.all([
    db.select({
      current: sql<number>`count(*) filter (where ${clinics.createdAt} >= ${currentStartIso}::timestamptz)::int`,
      previous: sql<number>`count(*) filter (where ${clinics.createdAt} >= ${previousStartIso}::timestamptz and ${clinics.createdAt} < ${currentStartIso}::timestamptz)::int`,
    }).from(clinics),
    db.select({
      current: sql<number>`count(*) filter (where ${users.createdAt} >= ${currentStartIso}::timestamptz)::int`,
      previous: sql<number>`count(*) filter (where ${users.createdAt} >= ${previousStartIso}::timestamptz and ${users.createdAt} < ${currentStartIso}::timestamptz)::int`,
    }).from(users),
    db.select({
      current: sql<number>`count(*) filter (where ${clients.createdAt} >= ${currentStartIso}::timestamptz)::int`,
      previous: sql<number>`count(*) filter (where ${clients.createdAt} >= ${previousStartIso}::timestamptz and ${clients.createdAt} < ${currentStartIso}::timestamptz)::int`,
    }).from(clients).where(isNull(clients.deletedAt)),
    db.select({
      current: sql<number>`count(*) filter (where ${supportTickets.createdAt} >= ${currentStartIso}::timestamptz)::int`,
      previous: sql<number>`count(*) filter (where ${supportTickets.createdAt} >= ${previousStartIso}::timestamptz and ${supportTickets.createdAt} < ${currentStartIso}::timestamptz)::int`,
    }).from(supportTickets),
    db.select({
      active: sql<number>`count(*) filter (where ${clients.status} = 'aktif' and ${clients.deletedAt} is null)::int`,
      archived: sql<number>`count(*) filter (where ${clients.status} = 'arşiv' or ${clients.deletedAt} is not null)::int`,
    }).from(clients),
    db.select({
      open: sql<number>`count(*) filter (where ${supportTickets.status} not in ('resolved', 'closed'))::int`,
      untriaged: sql<number>`count(*) filter (where ${supportTickets.status} = 'submitted' and ${supportTickets.triagePriority} is null)::int`,
      urgent: sql<number>`count(*) filter (where ${supportTickets.status} not in ('resolved', 'closed') and ${supportTickets.triagePriority} in ('P1', 'P2'))::int`,
    }).from(supportTickets),
    db.select({
      incomplete: sql<number>`count(*) filter (where ${clinics.onboardingCompletedAt} is null)::int`,
    }).from(clinics),
    db.select({ status: clinics.subscriptionStatus, value: count() })
      .from(clinics)
      .groupBy(clinics.subscriptionStatus),
    db.select({ plan: subscriptions.planCode, value: count() })
      .from(subscriptions)
      .groupBy(subscriptions.planCode),
    db.select({ month: clinicMonth, value: count() })
      .from(clinics)
      .where(sql`${clinics.createdAt} >= ${seriesStartIso}::timestamptz`)
      .groupBy(sql`date_trunc('month', ${clinics.createdAt})`),
    db.select({ month: userMonth, value: count() })
      .from(users)
      .where(sql`${users.createdAt} >= ${seriesStartIso}::timestamptz`)
      .groupBy(sql`date_trunc('month', ${users.createdAt})`),
    db.select({ month: clientMonth, value: count() })
      .from(clients)
      .where(and(sql`${clients.createdAt} >= ${seriesStartIso}::timestamptz`, isNull(clients.deletedAt)))
      .groupBy(sql`date_trunc('month', ${clients.createdAt})`),
    db.select({ month: ticketMonth, value: count() })
      .from(supportTickets)
      .where(sql`${supportTickets.createdAt} >= ${seriesStartIso}::timestamptz`)
      .groupBy(sql`date_trunc('month', ${supportTickets.createdAt})`),
    db.select({
      id: platformAuditLogs.id,
      action: platformAuditLogs.action,
      outcome: platformAuditLogs.outcome,
      entityType: platformAuditLogs.entityType,
      actorName: users.name,
      createdAt: platformAuditLogs.createdAt,
    })
      .from(platformAuditLogs)
      .leftJoin(users, eq(users.id, platformAuditLogs.actorUserId))
      .orderBy(desc(platformAuditLogs.createdAt))
      .limit(8),
  ])

  const indexed = <T extends { month: string; value: number }>(rows: T[]) =>
    new Map(rows.map((row) => [row.month, row.value]))
  const clinicIndex = indexed(clinicSeries)
  const userIndex = indexed(userSeries)
  const clientIndex = indexed(clientSeries)
  const ticketIndex = indexed(ticketSeries)

  return {
    comparisonDays: 30,
    growth: {
      clinics: periodValues(clinicGrowth),
      users: periodValues(userGrowth),
      clients: periodValues(clientGrowth),
      tickets: periodValues(ticketGrowth),
    },
    totals: {
      activeClients: clientTotals?.active ?? 0,
      archivedClients: clientTotals?.archived ?? 0,
      openTickets: ticketTotals?.open ?? 0,
      untriagedTickets: ticketTotals?.untriaged ?? 0,
      urgentTickets: ticketTotals?.urgent ?? 0,
      incompleteOnboarding: onboardingTotals?.incomplete ?? 0,
    },
    monthly: months.map((month) => ({
      ...month,
      clinics: clinicIndex.get(month.key) ?? 0,
      users: userIndex.get(month.key) ?? 0,
      clients: clientIndex.get(month.key) ?? 0,
      tickets: ticketIndex.get(month.key) ?? 0,
    })),
    subscriptionStatuses: Object.fromEntries(
      subscriptionStatuses.map((row) => [row.status, row.value]),
    ) as Record<string, number>,
    planDistribution: Object.fromEntries(
      planDistribution.map((row) => [row.plan ?? 'unknown', row.value]),
    ) as Record<string, number>,
    recentActivity,
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

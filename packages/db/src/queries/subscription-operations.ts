import {
  assertManualStatusTransition,
  detectSubscriptionDrift,
  getPlanLimitViolations,
  getPlanLimits,
  type PaymentProviderName,
  type SubscriptionBillingCycle,
  type SubscriptionPlan,
  type SubscriptionStatus,
} from '@ogun/subscription-core'
import { and, asc, count, desc, eq, gte, ilike, isNull, lte, or, sql } from 'drizzle-orm'
import type { Database } from '../client'
import {
  clinicMembers,
  clinics,
  clients,
  platformAuditLogs,
  platformStaff,
  smsLogs,
  subscriptionEmailNotifications,
  subscriptionEvents,
  subscriptions,
  users,
} from '../schema'

export interface PlatformSubscriptionFilters {
  search?: string
  plan?: SubscriptionPlan
  status?: SubscriptionStatus
  billingCycle?: SubscriptionBillingCycle
  provider?: PaymentProviderName
  cancelAtPeriodEnd?: boolean
  trialEndingSoon?: boolean
  driftOnly?: boolean
  page?: number
  pageSize?: 25 | 50 | 100
  now?: Date
}

export interface SubscriptionMutationActor {
  actorUserId: string
  platformStaffId: string
  ipAddress?: string | null
  userAgent?: string | null
}

export class SubscriptionOperationError extends Error {
  constructor(
    message: string,
    public readonly code:
      'not_found' | 'external_provider' | 'invalid_reason' | 'invalid_operation' | 'limit_exceeded',
  ) {
    super(message)
    this.name = 'SubscriptionOperationError'
  }
}

const ACTIVE_CLIENT_COUNT = sql<number>`(
  select count(*)::int from ${clients} c
  where c.clinic_id = ${clinics.id} and c.status = 'aktif' and c.deleted_at is null
)`
const ACTIVE_USER_COUNT = sql<number>`(
  select count(*)::int from ${clinicMembers} cm where cm.clinic_id = ${clinics.id}
)`
const LAST_EVENT_AT = sql<Date | null>`(
  select max(se.occurred_at) from ${subscriptionEvents} se where se.clinic_id = ${clinics.id}
)`

function listConditions(filters: PlatformSubscriptionFilters) {
  const conditions = []
  const search = filters.search?.trim()
  const now = filters.now ?? new Date()
  const nowIso = now.toISOString()
  if (search)
    conditions.push(or(ilike(clinics.name, `%${search}%`), ilike(clinics.slug, `%${search}%`))!)
  if (filters.plan) conditions.push(eq(subscriptions.planCode, filters.plan))
  if (filters.status) conditions.push(eq(clinics.subscriptionStatus, filters.status))
  if (filters.billingCycle) conditions.push(eq(subscriptions.billingCycle, filters.billingCycle))
  if (filters.provider) conditions.push(eq(subscriptions.provider, filters.provider))
  if (filters.cancelAtPeriodEnd !== undefined)
    conditions.push(eq(subscriptions.cancelAtPeriodEnd, filters.cancelAtPeriodEnd))
  if (filters.trialEndingSoon) {
    const soon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    conditions.push(
      and(
        eq(clinics.subscriptionStatus, 'trialing'),
        gte(clinics.trialEndsAt, now),
        lte(clinics.trialEndsAt, soon),
      )!,
    )
  }
  if (filters.driftOnly)
    conditions.push(
      sql`(
        (${clinics.subscriptionStatus} = 'active' and ${subscriptions.id} is null)
        or (${clinics.subscriptionStatus} = 'trialing' and ${clinics.trialEndsAt} < ${nowIso}::timestamptz)
        or (${clinics.subscriptionStatus} = 'active' and ${subscriptions.cancelAtPeriodEnd} = true and ${subscriptions.currentPeriodEnd} < ${nowIso}::timestamptz)
        or (${subscriptions.provider} = 'manuel' and ${subscriptions.providerSubscriptionId} is null)
      )`,
    )
  return conditions.length ? and(...conditions) : undefined
}

export async function listSubscriptionsForPlatform(
  db: Database,
  filters: PlatformSubscriptionFilters = {},
) {
  const requestedPage = Math.trunc(filters.page ?? 1)
  const page = Number.isFinite(requestedPage) ? Math.max(1, requestedPage) : 1
  const pageSize = ([25, 50, 100] as const).includes(filters.pageSize as 25 | 50 | 100)
    ? filters.pageSize!
    : 25
  const where = listConditions(filters)
  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        clinicId: clinics.id,
        clinicName: clinics.name,
        clinicSlug: clinics.slug,
        planCode: subscriptions.planCode,
        status: clinics.subscriptionStatus,
        billingCycle: subscriptions.billingCycle,
        provider: subscriptions.provider,
        trialEndsAt: clinics.trialEndsAt,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
        cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
        activeUsers: ACTIVE_USER_COUNT,
        activeClients: ACTIVE_CLIENT_COUNT,
        lastEventAt: LAST_EVENT_AT,
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

const SECRET_KEY = /(token|secret|authorization|card|paymentcard|apikey|checkouttoken)/i

export function redactSubscriptionPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSubscriptionPayload)
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        SECRET_KEY.test(key) ? '[REDACTED]' : redactSubscriptionPayload(child),
      ]),
    )
  return value
}

export function maskProviderReference(value: string | null) {
  if (!value) return null
  return value.length <= 4 ? '••••' : `••••${value.slice(-4)}`
}

export async function getSubscriptionForPlatform(db: Database, clinicId: string, now = new Date()) {
  const [row] = await db
    .select({
      clinicId: clinics.id,
      clinicName: clinics.name,
      clinicSlug: clinics.slug,
      status: clinics.subscriptionStatus,
      trialEndsAt: clinics.trialEndsAt,
      subscriptionId: subscriptions.id,
      planCode: subscriptions.planCode,
      billingCycle: subscriptions.billingCycle,
      provider: subscriptions.provider,
      providerCustomerId: subscriptions.providerCustomerId,
      providerSubscriptionId: subscriptions.providerSubscriptionId,
      currentPeriodStart: subscriptions.currentPeriodStart,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
      activeUsers: ACTIVE_USER_COUNT,
      activeClients: ACTIVE_CLIENT_COUNT,
    })
    .from(clinics)
    .leftJoin(subscriptions, eq(subscriptions.clinicId, clinics.id))
    .where(eq(clinics.id, clinicId))
    .limit(1)
  if (!row) return null

  const [events, [smsRow]] = await Promise.all([
    db
      .select({
        id: subscriptionEvents.id,
        eventType: subscriptionEvents.eventType,
        payload: subscriptionEvents.payload,
        source: subscriptionEvents.source,
        actorUserId: subscriptionEvents.actorUserId,
        actorPlatformStaffId: subscriptionEvents.actorPlatformStaffId,
        occurredAt: subscriptionEvents.occurredAt,
        actorName: sql<string | null>`coalesce(
          (select u.name from ${users} u where u.id = ${subscriptionEvents.actorUserId}),
          (select u.name from ${platformStaff} ps join ${users} u on u.id = ps.user_id where ps.id = ${subscriptionEvents.actorPlatformStaffId})
        )`,
      })
      .from(subscriptionEvents)
      .where(eq(subscriptionEvents.clinicId, clinicId))
      .orderBy(desc(subscriptionEvents.occurredAt)),
    row.currentPeriodStart && row.currentPeriodEnd
      ? db
          .select({ value: count() })
          .from(smsLogs)
          .where(
            and(
              eq(smsLogs.clinicId, clinicId),
              eq(smsLogs.status, 'gönderildi'),
              gte(smsLogs.sentAt, row.currentPeriodStart),
              lte(smsLogs.sentAt, row.currentPeriodEnd),
            ),
          )
      : Promise.resolve([{ value: 0 }]),
  ])
  const subscription = row.subscriptionId
    ? {
        provider: row.provider!,
        providerSubscriptionId: row.providerSubscriptionId,
        cancelAtPeriodEnd: row.cancelAtPeriodEnd!,
        currentPeriodEnd: row.currentPeriodEnd,
      }
    : null
  const limits = getPlanLimits(row.planCode, row.status === 'trialing')
  const { providerCustomerId, providerSubscriptionId, ...safeRow } = row
  return {
    ...safeRow,
    providerCustomerReference: maskProviderReference(providerCustomerId),
    providerSubscriptionReference: maskProviderReference(providerSubscriptionId),
    usage: {
      activeUsers: row.activeUsers,
      activeClients: row.activeClients,
      smsSent: smsRow?.value ?? 0,
    },
    limits,
    drift: detectSubscriptionDrift({
      clinicStatus: row.status,
      trialEndsAt: row.trialEndsAt,
      subscription,
      now,
    }),
    events: events.map((event) => ({
      ...event,
      payload: redactSubscriptionPayload(event.payload),
    })),
  }
}

export async function getSubscriptionDashboardSummary(db: Database, now = new Date()) {
  const soon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const nowIso = now.toISOString()
  const soonIso = soon.toISOString()
  const [row] = await db
    .select({
      active: sql<number>`count(*) filter (where ${clinics.subscriptionStatus} = 'active')::int`,
      trialing: sql<number>`count(*) filter (where ${clinics.subscriptionStatus} = 'trialing')::int`,
      pastDue: sql<number>`count(*) filter (where ${clinics.subscriptionStatus} = 'past_due')::int`,
      cancelPending: sql<number>`count(*) filter (where ${subscriptions.cancelAtPeriodEnd} = true)::int`,
      trialsEndingSoon: sql<number>`count(*) filter (where ${clinics.subscriptionStatus} = 'trialing' and ${clinics.trialEndsAt} between ${nowIso}::timestamptz and ${soonIso}::timestamptz)::int`,
      drift: sql<number>`count(*) filter (where
        (${clinics.subscriptionStatus} = 'active' and ${subscriptions.id} is null)
        or (${clinics.subscriptionStatus} = 'trialing' and ${clinics.trialEndsAt} < ${nowIso}::timestamptz)
        or (${clinics.subscriptionStatus} = 'active' and ${subscriptions.cancelAtPeriodEnd} = true and ${subscriptions.currentPeriodEnd} < ${nowIso}::timestamptz)
        or (${subscriptions.provider} = 'manuel' and ${subscriptions.providerSubscriptionId} is null)
      )::int`,
    })
    .from(clinics)
    .leftJoin(subscriptions, eq(subscriptions.clinicId, clinics.id))
  return (
    row ?? { active: 0, trialing: 0, pastDue: 0, cancelPending: 0, trialsEndingSoon: 0, drift: 0 }
  )
}

function requiredReason(reason: string) {
  const value = reason.trim()
  if (value.length < 5 || value.length > 500)
    throw new SubscriptionOperationError('Gerekçe 5–500 karakter olmalıdır.', 'invalid_reason')
  return value
}

async function getOwnerRecipient(db: Database, clinicId: string) {
  const [owner] = await db
    .select({ userId: users.id, email: users.email })
    .from(clinicMembers)
    .innerJoin(users, eq(users.id, clinicMembers.userId))
    .where(and(eq(clinicMembers.clinicId, clinicId), eq(clinicMembers.role, 'owner')))
    .orderBy(asc(clinicMembers.joinedAt), asc(clinicMembers.id))
    .limit(1)
  return owner ?? null
}

function auditValues(
  actor: SubscriptionMutationActor,
  clinicId: string,
  subscriptionId: string | null,
  action: string,
  reason: string,
  metadata: Record<string, unknown>,
) {
  return {
    actorUserId: actor.actorUserId,
    platformStaffId: actor.platformStaffId,
    action,
    entityType: 'subscription',
    entityId: subscriptionId ?? clinicId,
    clinicId,
    outcome: 'success' as const,
    reason,
    ipAddress: actor.ipAddress ?? null,
    userAgent: actor.userAgent ?? null,
    metadata,
  }
}

async function loadManualTarget(db: Database, clinicId: string, allowMissing = false) {
  const [target] = await db
    .select({ clinic: clinics, subscription: subscriptions })
    .from(clinics)
    .leftJoin(subscriptions, eq(subscriptions.clinicId, clinics.id))
    .where(eq(clinics.id, clinicId))
    .limit(1)
  if (!target) throw new SubscriptionOperationError('Klinik bulunamadı.', 'not_found')
  if (!target.subscription && !allowMissing)
    throw new SubscriptionOperationError('Abonelik kaydı bulunamadı.', 'not_found')
  if (target.subscription && target.subscription.provider !== 'manuel')
    throw new SubscriptionOperationError(
      'Bu abonelik harici ödeme sağlayıcısı tarafından yönetiliyor; DB-only işlem desteklenmiyor.',
      'external_provider',
    )
  return target
}

async function appendOperationRecords(
  tx: Parameters<Parameters<Database['transaction']>[0]>[0],
  input: {
    actor: SubscriptionMutationActor
    clinicId: string
    subscriptionId: string | null
    eventType: string
    auditAction: string
    reason: string
    payload: Record<string, unknown>
    owner: { userId: string; email: string } | null
  },
) {
  const [event] = await tx
    .insert(subscriptionEvents)
    .values({
      clinicId: input.clinicId,
      subscriptionId: input.subscriptionId,
      eventType: input.eventType,
      payload: input.payload,
      source: 'platform_staff',
      actorUserId: input.actor.actorUserId,
      actorPlatformStaffId: input.actor.platformStaffId,
    })
    .returning({ id: subscriptionEvents.id })
  if (!event) throw new Error('Abonelik olayı kaydedilemedi.')
  await tx
    .insert(platformAuditLogs)
    .values(
      auditValues(
        input.actor,
        input.clinicId,
        input.subscriptionId,
        input.auditAction,
        input.reason,
        input.payload,
      ),
    )
  if (input.owner)
    await tx.insert(subscriptionEmailNotifications).values({
      clinicId: input.clinicId,
      subscriptionEventId: event.id,
      recipientUserId: input.owner.userId,
      recipientEmail: input.owner.email,
    })
  return event.id
}

export async function extendSubscriptionTrial(
  db: Database,
  input: SubscriptionMutationActor & { clinicId: string; days: number; reason: string; now?: Date },
) {
  const reason = requiredReason(input.reason)
  if (!Number.isInteger(input.days) || input.days <= 0 || input.days > 90)
    throw new SubscriptionOperationError(
      'Deneme uzatma süresi 1–90 tam gün olmalıdır.',
      'invalid_operation',
    )
  const target = await loadManualTarget(db, input.clinicId, true)
  if (target.clinic.subscriptionStatus !== 'trialing')
    throw new SubscriptionOperationError(
      'Yalnız deneme durumundaki klinikler uzatılabilir.',
      'invalid_operation',
    )
  const owner = await getOwnerRecipient(db, input.clinicId)
  const now = input.now ?? new Date()
  const previous = target.clinic.trialEndsAt
  const base = previous && previous > now ? previous : now
  const next = new Date(base.getTime() + input.days * 24 * 60 * 60 * 1000)
  const eventId = await db.transaction(async (tx) => {
    await tx
      .update(clinics)
      .set({ trialEndsAt: next, updatedAt: now })
      .where(eq(clinics.id, input.clinicId))
    return appendOperationRecords(tx, {
      actor: input,
      clinicId: input.clinicId,
      subscriptionId: target.subscription?.id ?? null,
      eventType: 'trial_extended',
      auditAction: 'subscription.trial_extended',
      reason,
      payload: {
        previousTrialEndsAt: previous?.toISOString() ?? null,
        newTrialEndsAt: next.toISOString(),
        days: input.days,
        reason,
      },
      owner,
    })
  })
  return { eventId, trialEndsAt: next }
}

export async function changeManualSubscriptionPlan(
  db: Database,
  input: SubscriptionMutationActor & {
    clinicId: string
    planCode: SubscriptionPlan
    reason: string
  },
) {
  const reason = requiredReason(input.reason)
  const target = await loadManualTarget(db, input.clinicId)
  const [[clientUsage], [userUsage]] = await Promise.all([
    db
      .select({ value: count() })
      .from(clients)
      .where(
        and(
          eq(clients.clinicId, input.clinicId),
          eq(clients.status, 'aktif'),
          isNull(clients.deletedAt),
        ),
      ),
    db
      .select({ value: count() })
      .from(clinicMembers)
      .where(eq(clinicMembers.clinicId, input.clinicId)),
  ])
  const violations = getPlanLimitViolations(input.planCode, {
    activeClients: clientUsage?.value ?? 0,
    activeUsers: userUsage?.value ?? 0,
  })
  if (violations.length)
    throw new SubscriptionOperationError(
      `Bu klinik yeni plan limitlerini aşıyor: ${violations.join(', ')}`,
      'limit_exceeded',
    )
  const owner = await getOwnerRecipient(db, input.clinicId)
  const subscription = target.subscription!
  const payload = {
    fromPlan: subscription.planCode,
    toPlan: input.planCode,
    fromBillingCycle: subscription.billingCycle,
    toBillingCycle: subscription.billingCycle,
    reason,
  }
  const eventId = await db.transaction(async (tx) => {
    await tx
      .update(subscriptions)
      .set({ planCode: input.planCode, updatedAt: new Date() })
      .where(eq(subscriptions.id, subscription.id))
    return appendOperationRecords(tx, {
      actor: input,
      clinicId: input.clinicId,
      subscriptionId: subscription.id,
      eventType: 'plan_changed',
      auditAction: 'subscription.plan_changed',
      reason,
      payload,
      owner,
    })
  })
  return { eventId }
}

export async function changeManualSubscriptionBillingCycle(
  db: Database,
  input: SubscriptionMutationActor & {
    clinicId: string
    billingCycle: SubscriptionBillingCycle
    reason: string
  },
) {
  const reason = requiredReason(input.reason)
  const target = await loadManualTarget(db, input.clinicId)
  const owner = await getOwnerRecipient(db, input.clinicId)
  const subscription = target.subscription!
  const payload = {
    fromPlan: subscription.planCode,
    toPlan: subscription.planCode,
    fromBillingCycle: subscription.billingCycle,
    toBillingCycle: input.billingCycle,
    reason,
  }
  const eventId = await db.transaction(async (tx) => {
    await tx
      .update(subscriptions)
      .set({ billingCycle: input.billingCycle, updatedAt: new Date() })
      .where(eq(subscriptions.id, subscription.id))
    return appendOperationRecords(tx, {
      actor: input,
      clinicId: input.clinicId,
      subscriptionId: subscription.id,
      eventType: 'billing_cycle_changed',
      auditAction: 'subscription.billing_cycle_changed',
      reason,
      payload,
      owner,
    })
  })
  return { eventId }
}

export async function setManualSubscriptionCancellation(
  db: Database,
  input: SubscriptionMutationActor & {
    clinicId: string
    cancelAtPeriodEnd: boolean
    reason: string
  },
) {
  const reason = requiredReason(input.reason)
  const target = await loadManualTarget(db, input.clinicId)
  const owner = await getOwnerRecipient(db, input.clinicId)
  const subscription = target.subscription!
  const eventType = input.cancelAtPeriodEnd ? 'cancel_requested' : 'cancel_request_reverted'
  const auditAction = input.cancelAtPeriodEnd
    ? 'subscription.cancel_requested'
    : 'subscription.cancel_reverted'
  const payload = {
    cancelAtPeriodEnd: input.cancelAtPeriodEnd,
    currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
    reason,
  }
  const eventId = await db.transaction(async (tx) => {
    await tx
      .update(subscriptions)
      .set({ cancelAtPeriodEnd: input.cancelAtPeriodEnd, updatedAt: new Date() })
      .where(eq(subscriptions.id, subscription.id))
    return appendOperationRecords(tx, {
      actor: input,
      clinicId: input.clinicId,
      subscriptionId: subscription.id,
      eventType,
      auditAction,
      reason,
      payload,
      owner,
    })
  })
  return { eventId }
}

export async function correctManualSubscriptionStatus(
  db: Database,
  input: SubscriptionMutationActor & {
    clinicId: string
    status: SubscriptionStatus
    reason: string
  },
) {
  const reason = requiredReason(input.reason)
  const target = await loadManualTarget(db, input.clinicId)
  assertManualStatusTransition(target.clinic.subscriptionStatus, input.status)
  const owner = await getOwnerRecipient(db, input.clinicId)
  const subscription = target.subscription!
  const payload = { fromStatus: target.clinic.subscriptionStatus, toStatus: input.status, reason }
  const eventId = await db.transaction(async (tx) => {
    await tx
      .update(clinics)
      .set({ subscriptionStatus: input.status, updatedAt: new Date() })
      .where(eq(clinics.id, input.clinicId))
    return appendOperationRecords(tx, {
      actor: input,
      clinicId: input.clinicId,
      subscriptionId: subscription.id,
      eventType: 'status_corrected',
      auditAction: 'subscription.status_corrected',
      reason,
      payload,
      owner,
    })
  })
  return { eventId }
}

export async function activateManualSubscription(
  db: Database,
  input: SubscriptionMutationActor & { clinicId: string; reason: string },
) {
  return correctManualSubscriptionStatus(db, { ...input, status: 'active' })
}

export async function getSubscriptionEmailNotification(db: Database, notificationId: string) {
  const [row] = await db
    .select({
      id: subscriptionEmailNotifications.id,
      clinicId: subscriptionEmailNotifications.clinicId,
      recipientEmail: subscriptionEmailNotifications.recipientEmail,
      status: subscriptionEmailNotifications.status,
      eventType: subscriptionEvents.eventType,
      payload: subscriptionEvents.payload,
      clinicName: clinics.name,
    })
    .from(subscriptionEmailNotifications)
    .innerJoin(
      subscriptionEvents,
      eq(subscriptionEvents.id, subscriptionEmailNotifications.subscriptionEventId),
    )
    .innerJoin(clinics, eq(clinics.id, subscriptionEmailNotifications.clinicId))
    .where(eq(subscriptionEmailNotifications.id, notificationId))
    .limit(1)
  return row ?? null
}

export async function getSubscriptionEmailNotificationByEvent(db: Database, eventId: string) {
  const [row] = await db
    .select({ id: subscriptionEmailNotifications.id })
    .from(subscriptionEmailNotifications)
    .where(eq(subscriptionEmailNotifications.subscriptionEventId, eventId))
    .limit(1)
  return row ?? null
}

export async function markSubscriptionEmailSent(
  db: Database,
  notificationId: string,
  now = new Date(),
) {
  await db
    .update(subscriptionEmailNotifications)
    .set({
      status: 'sent',
      sentAt: now,
      lastAttemptAt: now,
      attemptCount: sql`${subscriptionEmailNotifications.attemptCount} + 1`,
      lastError: null,
      updatedAt: now,
    })
    .where(eq(subscriptionEmailNotifications.id, notificationId))
}

export async function markSubscriptionEmailFailed(
  db: Database,
  notificationId: string,
  error: string,
  now = new Date(),
) {
  await db
    .update(subscriptionEmailNotifications)
    .set({
      status: 'failed',
      lastAttemptAt: now,
      attemptCount: sql`${subscriptionEmailNotifications.attemptCount} + 1`,
      lastError: error.slice(0, 1000),
      updatedAt: now,
    })
    .where(eq(subscriptionEmailNotifications.id, notificationId))
}

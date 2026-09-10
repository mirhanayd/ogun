import { createId } from '@paralleldrive/cuid2'
import { and, eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from '../client'
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
import {
  changeManualSubscriptionPlan,
  correctManualSubscriptionStatus,
  extendSubscriptionTrial,
  getSubscriptionForPlatform,
  listSubscriptionsForPlatform,
  redactSubscriptionPayload,
  setManualSubscriptionCancellation,
} from './subscription-operations'

describe('subscription platform projection', () => {
  it('recursively redacts secret-like fields', () => {
    expect(
      redactSubscriptionPayload({
        ok: 'visible',
        nested: { checkoutToken: 'secret', APIKey: 'key', rows: [{ card: '4111' }] },
      }),
    ).toEqual({
      ok: 'visible',
      nested: { checkoutToken: '[REDACTED]', APIKey: '[REDACTED]', rows: [{ card: '[REDACTED]' }] },
    })
  })
})

const describeWithDb =
  process.env.SUBSCRIPTION_OPERATION_WRITE_TESTS === '1' ? describe : describe.skip

async function fixture(
  options: {
    provider?: 'manuel' | 'iyzico'
    status?: 'trialing' | 'active' | 'past_due' | 'canceled'
    plan?: 'başlangıç' | 'klinik'
    extraUsers?: number
  } = {},
) {
  const suffix = createId()
  const actorId = `s6-actor-${suffix}`
  const ownerId = `s6-owner-${suffix}`
  const staffId = `s6-staff-${suffix}`
  const clinicId = `s6-clinic-${suffix}`
  await db.insert(users).values([
    { id: actorId, email: `actor-${suffix}@example.test`, name: 'Platform Actor' },
    { id: ownerId, email: `owner-${suffix}@example.test`, name: 'Clinic Owner' },
  ])
  await db.insert(platformStaff).values({ id: staffId, userId: actorId, role: 'billing_ops' })
  await db.insert(clinics).values({
    id: clinicId,
    name: `Subscription Clinic ${suffix}`,
    slug: `subscription-${suffix}`,
    createdBy: ownerId,
    subscriptionStatus: options.status ?? 'active',
    trialEndsAt: new Date('2026-09-20T00:00:00Z'),
  })
  await db
    .insert(clinicMembers)
    .values({ id: `s6-member-${suffix}`, clinicId, userId: ownerId, role: 'owner' })
  for (let index = 0; index < (options.extraUsers ?? 0); index += 1) {
    const userId = `s6-user-${index}-${suffix}`
    await db
      .insert(users)
      .values({
        id: userId,
        email: `member-${index}-${suffix}@example.test`,
        name: `Member ${index}`,
      })
    await db
      .insert(clinicMembers)
      .values({ id: `s6-member-${index}-${suffix}`, clinicId, userId, role: 'assistant' })
  }
  const subscriptionId = `s6-sub-${suffix}`
  await db.insert(subscriptions).values({
    id: subscriptionId,
    clinicId,
    planCode: options.plan ?? 'klinik',
    billingCycle: 'monthly',
    provider: options.provider ?? 'manuel',
    providerCustomerId: `customer-secret-${suffix}`,
    providerSubscriptionId: `subscription-secret-${suffix}`,
    checkoutToken: `checkout-secret-${suffix}`,
    currentPeriodStart: new Date('2026-09-01T00:00:00Z'),
    currentPeriodEnd: new Date('2026-10-01T00:00:00Z'),
  })
  return {
    suffix,
    actorId,
    ownerId,
    staffId,
    clinicId,
    subscriptionId,
    actor: { actorUserId: actorId, platformStaffId: staffId },
  }
}

describeWithDb('subscription operations integration', () => {
  it('paginates and filters real rows; detail has usage, ordered events, drift and no secrets', async () => {
    const item = await fixture({ status: 'trialing' })
    const clientId = `s6-client-${item.suffix}`
    await db
      .insert(clients)
      .values({
        id: clientId,
        clinicId: item.clinicId,
        firstName: 'Aktif',
        lastName: 'Danışan',
        status: 'aktif',
      })
    await db
      .insert(smsLogs)
      .values({
        id: `s6-sms-${item.suffix}`,
        clinicId: item.clinicId,
        clientId,
        phone: '5550000000',
        message: 'test',
        status: 'gönderildi',
        provider: 'test',
        sentAt: new Date('2026-09-05T00:00:00Z'),
      })
    await db.insert(subscriptionEvents).values([
      {
        id: `s6-event-old-${item.suffix}`,
        clinicId: item.clinicId,
        subscriptionId: item.subscriptionId,
        eventType: 'older',
        payload: { checkoutToken: 'never-return' },
        source: 'system',
        occurredAt: new Date('2026-09-01T00:00:00Z'),
      },
      {
        id: `s6-event-new-${item.suffix}`,
        clinicId: item.clinicId,
        subscriptionId: item.subscriptionId,
        eventType: 'newer',
        source: 'system',
        occurredAt: new Date('2026-09-02T00:00:00Z'),
      },
    ])

    const list = await listSubscriptionsForPlatform(db, {
      search: item.suffix,
      plan: 'klinik',
      status: 'trialing',
      provider: 'manuel',
      billingCycle: 'monthly',
      cancelAtPeriodEnd: false,
      pageSize: 25,
      now: new Date('2026-09-10T00:00:00Z'),
    })
    expect(list.rows).toHaveLength(1)
    expect(list.total).toBe(1)
    expect(list.pageSize).toBe(25)
    expect(
      (
        await listSubscriptionsForPlatform(db, {
          search: item.suffix,
          page: 2,
          pageSize: 25,
        })
      ).rows,
    ).toHaveLength(0)
    const detail = await getSubscriptionForPlatform(
      db,
      item.clinicId,
      new Date('2026-09-10T00:00:00Z'),
    )
    expect(detail?.usage).toEqual({ activeUsers: 1, activeClients: 1, smsSent: 1 })
    expect(detail?.events.map((event) => event.eventType).slice(0, 2)).toEqual(['newer', 'older'])
    expect(JSON.stringify(detail)).not.toContain('checkout-secret')
    expect(JSON.stringify(detail)).not.toContain('customer-secret')
    expect(JSON.stringify(detail)).not.toContain('subscription-secret')
    expect(JSON.stringify(detail)).not.toContain('never-return')
    expect(detail?.drift).toEqual([])
    expect(
      (
        await listSubscriptionsForPlatform(db, {
          trialEndingSoon: true,
          search: item.suffix,
          now: new Date('2026-09-15T00:00:00Z'),
        })
      ).rows,
    ).toHaveLength(1)
  })

  it('supports trial, plan, cancel/reversal and status operations with event, audit and owner outbox', async () => {
    const trial = await fixture({ status: 'trialing' })
    const extended = await extendSubscriptionTrial(db, {
      ...trial.actor,
      clinicId: trial.clinicId,
      days: 14,
      reason: 'Müşteri talebi',
      now: new Date('2026-09-10T00:00:00Z'),
    })
    expect(extended.trialEndsAt.toISOString()).toBe('2026-10-04T00:00:00.000Z')
    await correctManualSubscriptionStatus(db, {
      ...trial.actor,
      clinicId: trial.clinicId,
      status: 'active',
      reason: 'Aktivasyon doğrulandı',
    })
    await changeManualSubscriptionPlan(db, {
      ...trial.actor,
      clinicId: trial.clinicId,
      planCode: 'başlangıç',
      reason: 'Klinik talebi',
    })
    await setManualSubscriptionCancellation(db, {
      ...trial.actor,
      clinicId: trial.clinicId,
      cancelAtPeriodEnd: true,
      reason: 'Dönem sonunda kapat',
    })
    await setManualSubscriptionCancellation(db, {
      ...trial.actor,
      clinicId: trial.clinicId,
      cancelAtPeriodEnd: false,
      reason: 'İptal talebi geri alındı',
    })
    const eventRows = await db
      .select()
      .from(subscriptionEvents)
      .where(eq(subscriptionEvents.clinicId, trial.clinicId))
    expect(eventRows.map((row) => row.eventType)).toEqual(
      expect.arrayContaining([
        'trial_extended',
        'status_corrected',
        'plan_changed',
        'cancel_requested',
        'cancel_request_reverted',
      ]),
    )
    expect(
      (
        await db
          .select()
          .from(platformAuditLogs)
          .where(eq(platformAuditLogs.clinicId, trial.clinicId))
      ).length,
    ).toBe(5)
    expect(
      (
        await db
          .select()
          .from(subscriptionEmailNotifications)
          .where(eq(subscriptionEmailNotifications.clinicId, trial.clinicId))
      ).length,
    ).toBe(5)
  })

  it('denies missing reason, over-limit downgrade and external-provider DB-only mutation', async () => {
    const over = await fixture({ extraUsers: 1 })
    await expect(
      changeManualSubscriptionPlan(db, {
        ...over.actor,
        clinicId: over.clinicId,
        planCode: 'başlangıç',
        reason: 'Limit testi',
      }),
    ).rejects.toMatchObject({ code: 'limit_exceeded' })
    await expect(
      setManualSubscriptionCancellation(db, {
        ...over.actor,
        clinicId: over.clinicId,
        cancelAtPeriodEnd: true,
        reason: '',
      }),
    ).rejects.toMatchObject({ code: 'invalid_reason' })
    const external = await fixture({ provider: 'iyzico' })
    await expect(
      correctManualSubscriptionStatus(db, {
        ...external.actor,
        clinicId: external.clinicId,
        status: 'canceled',
        reason: 'Mutasyon engeli',
      }),
    ).rejects.toMatchObject({ code: 'external_provider' })
  })

  it('rolls back business state when event or platform audit insertion fails', async () => {
    const item = await fixture()
    const createFailureTrigger = async (table: 'subscription_events' | 'platform_audit_logs') => {
      const key = `${table.replaceAll('_', '')}${createId()}`
      const safeClinicId = item.clinicId.replaceAll("'", "''")
      await db.execute(
        sql.raw(
          `create function ${key}_fn() returns trigger language plpgsql as $$ begin if new.clinic_id = '${safeClinicId}' then raise exception 'forced ${table} failure'; end if; return new; end $$`,
        ),
      )
      await db.execute(
        sql.raw(
          `create trigger ${key}_trigger before insert on ${table} for each row execute function ${key}_fn()`,
        ),
      )
      return async () => {
        await db.execute(sql.raw(`drop trigger ${key}_trigger on ${table}`))
        await db.execute(sql.raw(`drop function ${key}_fn()`))
      }
    }
    const removeEventTrigger = await createFailureTrigger('subscription_events')
    await expect(
      changeManualSubscriptionPlan(db, {
        ...item.actor,
        clinicId: item.clinicId,
        planCode: 'başlangıç',
        reason: 'Event rollback testi',
      }),
    ).rejects.toThrow('forced subscription_events failure')
    await removeEventTrigger()
    expect(
      (
        await db
          .select({ plan: subscriptions.planCode })
          .from(subscriptions)
          .where(eq(subscriptions.id, item.subscriptionId))
      )[0]?.plan,
    ).toBe('klinik')

    const removeAuditTrigger = await createFailureTrigger('platform_audit_logs')
    await expect(
      changeManualSubscriptionPlan(db, {
        ...item.actor,
        clinicId: item.clinicId,
        planCode: 'başlangıç',
        reason: 'Audit rollback testi',
      }),
    ).rejects.toThrow('forced platform_audit_logs failure')
    await removeAuditTrigger()
    expect(
      (
        await db
          .select({ plan: subscriptions.planCode })
          .from(subscriptions)
          .where(eq(subscriptions.id, item.subscriptionId))
      )[0]?.plan,
    ).toBe('klinik')
    expect(
      (
        await db
          .select()
          .from(subscriptionEvents)
          .where(
            and(
              eq(subscriptionEvents.clinicId, item.clinicId),
              eq(subscriptionEvents.eventType, 'plan_changed'),
            ),
          )
      ).length,
    ).toBe(0)
  })
})

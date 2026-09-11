import { createId } from '@paralleldrive/cuid2'
import { and, eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { db } from '../client'
import {
  appointments, clinicMembers, clinics, clients, operationalJobLeases, operationalJobRuns, providerWebhookReceipts,
  smsLogs, smsReminderDeliveries, subscriptionEmailNotifications, subscriptionEvents,
  subscriptions, users,
} from '../schema'
import {
  claimSmsReminderDelivery, claimSubscriptionNotification, markSmsReminderSent,
  markSubscriptionEmailFailed, recordProviderSubscriptionStatus, withOperationalJobLock,
} from './index'

const describeWithDb = process.env.OPERATIONAL_WRITE_TESTS === '1' ? describe : describe.skip

async function fixture() {
  const suffix = createId()
  const userId = `s7-user-${suffix}`
  const clinicId = `s7-clinic-${suffix}`
  const clientId = `s7-client-${suffix}`
  const appointmentId = `s7-appointment-${suffix}`
  const subscriptionId = `s7-sub-${suffix}`
  const now = new Date('2026-09-10T09:00:00Z')
  await db.insert(users).values({ id: userId, email: `${suffix}@example.test`, name: 'Ops Fixture' })
  await db.insert(clinics).values({ id: clinicId, name: 'Ops Clinic', slug: `ops-${suffix}`, createdBy: userId, onboardingCompletedAt: now, subscriptionStatus: 'active' })
  await db.insert(clinicMembers).values({ id: `s7-member-${suffix}`, clinicId, userId, role: 'owner' })
  await db.insert(clients).values({ id: clientId, clinicId, firstName: 'Test', lastName: 'Client', phone: '05321234567', smsConsentAt: now })
  await db.insert(appointments).values({ id: appointmentId, clinicId, clientId, dietitianId: userId, startsAt: new Date(now.getTime() + 24 * 3_600_000), endsAt: new Date(now.getTime() + 25 * 3_600_000) })
  await db.insert(subscriptions).values({ id: subscriptionId, clinicId, planCode: 'klinik', provider: 'iyzico', providerSubscriptionId: `provider-${suffix}` })
  return { suffix, userId, clinicId, clientId, appointmentId, subscriptionId, now }
}

describeWithDb('production operations concurrency', () => {
  it('skips a concurrent runner while the database lease is held', async () => {
    const suffix = createId()
    await db.delete(operationalJobLeases).where(eq(operationalJobLeases.jobName, 'maintenance'))
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const first = withOperationalJobLock(db, { jobName: 'maintenance', trigger: 'test', ownerToken: `a-${suffix}` }, async () => {
      await gate
      return { counts: { attempted: 0, succeeded: 0, failed: 0, skipped: 0 } }
    })
    await vi.waitFor(async () => {
      const rows = await db.select().from(operationalJobRuns).where(and(eq(operationalJobRuns.jobName, 'maintenance'), eq(operationalJobRuns.status, 'running')))
      expect(rows.length).toBeGreaterThan(0)
    })
    const second = await withOperationalJobLock(db, { jobName: 'maintenance', trigger: 'test', ownerToken: `b-${suffix}` }, async () => ({ counts: { attempted: 1, succeeded: 1, failed: 0, skipped: 0 } }))
    expect(second).toMatchObject({ status: 'skipped', reason: 'already_running' })
    release()
    expect((await first).status).toBe('success')
  })

  it('allows exactly one SMS provider call and one canonical success', async () => {
    const f = await fixture()
    const [a, b] = await Promise.all([
      claimSmsReminderDelivery(db, f),
      claimSmsReminderDelivery(db, f),
    ])
    const send = vi.fn().mockResolvedValue({ externalMessageId: 'provider-message' })
    for (const claim of [a, b]) if (claim) {
      await send()
      await markSmsReminderSent(db, { deliveryId: claim.id, ...f, phone: '05321234567', message: 'safe fixture', provider: 'manuel', providerMessageId: 'provider-message', now: f.now })
    }
    expect(send).toHaveBeenCalledOnce()
    expect(await db.select().from(smsLogs).where(eq(smsLogs.appointmentId, f.appointmentId))).toHaveLength(1)
  })

  it('recovers an expired processing claim as unknown without blind retry', async () => {
    const f = await fixture()
    const claim = await claimSmsReminderDelivery(db, f)
    expect(claim).not.toBeNull()
    await db.update(smsReminderDeliveries).set({ claimExpiresAt: new Date(f.now.getTime() - 1) }).where(eq(smsReminderDeliveries.id, claim!.id))
    expect(await claimSmsReminderDelivery(db, { ...f, now: new Date(f.now.getTime() + 1) })).toBeNull()
    const [delivery] = await db.select().from(smsReminderDeliveries).where(eq(smsReminderDeliveries.id, claim!.id))
    expect(delivery?.status).toBe('unknown')
  })

  it('atomically claims email and enforces due time plus terminal attempt limit', async () => {
    const f = await fixture()
    const [event] = await db.insert(subscriptionEvents).values({ clinicId: f.clinicId, subscriptionId: f.subscriptionId, eventType: 'test', source: 'system' }).returning()
    const [notification] = await db.insert(subscriptionEmailNotifications).values({ clinicId: f.clinicId, subscriptionEventId: event!.id, recipientUserId: f.userId, recipientEmail: `${f.suffix}@example.test`, nextAttemptAt: f.now }).returning()
    const [a, b] = await Promise.all([claimSubscriptionNotification(db, notification!.id, f.now), claimSubscriptionNotification(db, notification!.id, f.now)])
    expect([a, b].filter(Boolean)).toHaveLength(1)
    const claim = a ?? b
    const send = vi.fn().mockResolvedValue(undefined)
    for (const candidate of [a, b]) if (candidate) await send(candidate)
    expect(send).toHaveBeenCalledOnce()
    await markSubscriptionEmailFailed(db, notification!.id, 'provider failure', claim!.claimToken, f.now)
    expect(await claimSubscriptionNotification(db, notification!.id, new Date(f.now.getTime() + 30_000))).toBeNull()
    expect(await claimSubscriptionNotification(db, notification!.id, new Date(f.now.getTime() + 60_000))).not.toBeNull()
    await db.update(subscriptionEmailNotifications).set({ status: 'failed', attemptCount: 5, claimToken: null, claimExpiresAt: null, terminalAt: f.now }).where(eq(subscriptionEmailNotifications.id, notification!.id))
    expect(await claimSubscriptionNotification(db, notification!.id, new Date(f.now.getTime() + 86_400_000), true)).toBeNull()
  })

  it('deduplicates parallel provider events and does not regress on stale events', async () => {
    const f = await fixture()
    const common = { clinicId: f.clinicId, subscriptionId: f.subscriptionId, provider: 'iyzico' as const, eventType: 'subscription.order.success', providerEventId: `event-${f.suffix}`, payloadHash: 'a'.repeat(64), occurredAt: f.now, payload: {} }
    const results = await Promise.all([recordProviderSubscriptionStatus(db, { ...common, status: 'active' }), recordProviderSubscriptionStatus(db, { ...common, status: 'active' })])
    expect(results.filter((result) => !result.duplicate)).toHaveLength(1)
    expect(await db.select().from(subscriptionEvents).where(and(eq(subscriptionEvents.provider, 'iyzico'), eq(subscriptionEvents.providerEventId, common.providerEventId)))).toHaveLength(1)
    const [receipt] = await db.select().from(providerWebhookReceipts).where(eq(providerWebhookReceipts.providerEventId, common.providerEventId))
    expect(receipt?.attemptCount).toBe(2)
    await recordProviderSubscriptionStatus(db, { ...common, providerEventId: `old-${f.suffix}`, payloadHash: 'b'.repeat(64), occurredAt: new Date(f.now.getTime() - 60_000), status: 'past_due', eventType: 'subscription.order.failure' })
    const [clinic] = await db.select().from(clinics).where(eq(clinics.id, f.clinicId))
    expect(clinic?.subscriptionStatus).toBe('active')
  })
})

import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { db } from '@ogun/db'
import { clinicMembers, clinics, platformStaff, subscriptions, users } from '@ogun/db/schema'
import {
  changeManualSubscriptionPlan,
  getSubscriptionEmailNotification,
  getSubscriptionEmailNotificationByEvent,
  getSubscriptionForPlatform,
} from '@ogun/db/queries'
import type { EmailSender } from '@ogun/email'
import { dispatchSubscriptionNotification } from './subscription-email'

const describeWithDb =
  process.env.SUBSCRIPTION_OPERATION_WRITE_TESTS === '1' ? describe : describe.skip

describeWithDb('subscription owner notification integration', () => {
  it('keeps the subscription change when delivery fails and supports retry', async () => {
    const suffix = randomUUID().replaceAll('-', '')
    const actorId = `s6-mail-actor-${suffix}`
    const ownerId = `s6-mail-owner-${suffix}`
    const staffId = `s6-mail-staff-${suffix}`
    const clinicId = `s6-mail-clinic-${suffix}`
    const subscriptionId = `s6-mail-sub-${suffix}`
    await db.insert(users).values([
      { id: actorId, email: `mail-actor-${suffix}@example.test`, name: 'Actor' },
      { id: ownerId, email: `mail-owner-${suffix}@example.test`, name: 'Owner' },
    ])
    await db.insert(platformStaff).values({ id: staffId, userId: actorId, role: 'billing_ops' })
    await db
      .insert(clinics)
      .values({
        id: clinicId,
        name: 'E-posta Klinik',
        slug: `mail-${suffix}`,
        createdBy: ownerId,
        subscriptionStatus: 'active',
      })
    await db
      .insert(clinicMembers)
      .values({ id: `s6-mail-member-${suffix}`, clinicId, userId: ownerId, role: 'owner' })
    await db
      .insert(subscriptions)
      .values({
        id: subscriptionId,
        clinicId,
        planCode: 'başlangıç',
        provider: 'manuel',
        providerSubscriptionId: `manual-${suffix}`,
      })

    const operation = await changeManualSubscriptionPlan(db, {
      actorUserId: actorId,
      platformStaffId: staffId,
      clinicId,
      planCode: 'klinik',
      reason: 'E-posta davranış testi',
    })
    const notification = await getSubscriptionEmailNotificationByEvent(db, operation.eventId)
    expect(notification).not.toBeNull()
    const failingSender: EmailSender = {
      send: vi.fn().mockRejectedValue(new Error('provider unavailable')),
    }
    expect(await dispatchSubscriptionNotification(notification!.id, failingSender)).toEqual({
      status: 'failed',
    })
    expect((await getSubscriptionForPlatform(db, clinicId))?.planCode).toBe('klinik')
    expect((await getSubscriptionEmailNotification(db, notification!.id))?.status).toBe('failed')

    const successfulSender: EmailSender = { send: vi.fn().mockResolvedValue(undefined) }
    expect(await dispatchSubscriptionNotification(notification!.id, successfulSender)).toEqual({
      status: 'sent',
    })
    expect(successfulSender.send).toHaveBeenCalledOnce()
    expect(JSON.stringify(vi.mocked(successfulSender.send).mock.calls)).not.toContain(
      'providerSubscriptionId',
    )
  })
})

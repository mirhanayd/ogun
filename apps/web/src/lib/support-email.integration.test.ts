import { randomUUID } from 'node:crypto'
import { db } from '@ogun/db'
import { createSupportTicketForClinic, getSupportNotificationState, getSupportTicketForClinic } from '@ogun/db/queries'
import { clinicMembers, clinics, users } from '@ogun/db/schema'
import { describe, expect, it } from 'vitest'
import { dispatchSupportNotification } from './support-email'

const describeWithDb = process.env.SUPPORT_WRITE_TESTS === '1' ? describe : describe.skip

describeWithDb('support notification delivery integration', () => {
  it('keeps the ticket after provider failure and sends exactly once on retry', async () => {
    const suffix = randomUUID()
    const ownerId = `support-mail-owner-${suffix}`
    const clinicId = `support-mail-clinic-${suffix}`
    await db.insert(users).values({ id: ownerId, email: `${ownerId}@test.invalid`, name: 'Mail Owner' })
    await db.insert(clinics).values({ id: clinicId, name: 'Mail Clinic', slug: `support-mail-${suffix}`, createdBy: ownerId })
    await db.insert(clinicMembers).values({ id: `support-mail-member-${suffix}`, clinicId, userId: ownerId, role: 'owner' })
    const ticket = await createSupportTicketForClinic(db, {
      clinicId,
      requesterUserId: ownerId,
      clientRequestId: `support-mail-request-${suffix}`,
      type: 'technical_issue',
      area: 'dashboard',
      title: 'Bildirim teslim testi',
      reportedImpact: 'minor',
      body: 'E-posta sağlayıcısı hatasında talep korunmalıdır.',
    })
    const notificationId = ticket.notificationId!
    const previousOrigin = process.env.OGUN_WEB_URL
    process.env.OGUN_WEB_URL = 'http://localhost:3100'
    let attempts = 0
    try {
      const failed = await dispatchSupportNotification(notificationId, { sender: { send: async () => { attempts += 1; throw new Error('provider unavailable') } } })
      expect(failed.status).toBe('failed')
      expect((await getSupportTicketForClinic(db, clinicId, ticket.id))?.id).toBe(ticket.id)
      expect(await getSupportNotificationState(db, notificationId)).toMatchObject({ status: 'failed', attemptCount: 1, lastError: 'provider unavailable' })

      const sent = await dispatchSupportNotification(notificationId, { retry: true, sender: { send: async () => { attempts += 1 } } })
      expect(sent.status).toBe('sent')
      expect(await dispatchSupportNotification(notificationId, { retry: true, sender: { send: async () => { attempts += 1 } } })).toEqual({ status: 'not_sent' })
      expect(attempts).toBe(2)
      expect(await getSupportNotificationState(db, notificationId)).toMatchObject({ status: 'sent', attemptCount: 2, lastError: null })
    } finally {
      if (previousOrigin === undefined) delete process.env.OGUN_WEB_URL
      else process.env.OGUN_WEB_URL = previousOrigin
    }
  })
})

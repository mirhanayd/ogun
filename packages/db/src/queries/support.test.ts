import { createId } from '@paralleldrive/cuid2'
import { and, count, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from '../client'
import { clinicMembers, clinics, platformAuditLogs, platformStaff, supportEmailNotifications, supportTicketEvents, supportTicketMessages, supportTickets, users } from '../schema'
import { addClinicSupportReply, addPlatformSupportMessage, assignSupportTicketForPlatform, claimSupportNotification, createSupportTicketForClinic, getPublicSupportMessagesForClinic, getSupportTicketForClinic, listSupportTicketsForPlatform, markSupportNotificationFailed, markSupportNotificationSent, reopenSupportTicketForClinic, resolveSupportTicketForPlatform, setSupportTicketPriorityForPlatform, transitionSupportTicketForPlatform } from './support'

const describeWithDb = process.env.SUPPORT_WRITE_TESTS === '1' ? describe : describe.skip

async function fixture() {
  const suffix = createId(); const ownerId = `support-owner-${suffix}`; const otherOwnerId = `support-other-${suffix}`; const dietitianId = `support-diet-${suffix}`; const assistantId = `support-assistant-${suffix}`; const staffUserId = `support-staff-user-${suffix}`; const clinicId = `support-clinic-${suffix}`; const otherClinicId = `support-other-clinic-${suffix}`; const staffId = `support-staff-${suffix}`
  await db.insert(users).values([{ id: ownerId, email: `${ownerId}@test.invalid`, name: 'Owner' }, { id: otherOwnerId, email: `${otherOwnerId}@test.invalid`, name: 'Other' }, { id: dietitianId, email: `${dietitianId}@test.invalid`, name: 'Dietitian' }, { id: assistantId, email: `${assistantId}@test.invalid`, name: 'Assistant' }, { id: staffUserId, email: `${staffUserId}@test.invalid`, name: 'Support Staff' }])
  await db.insert(clinics).values([{ id: clinicId, name: 'Support Clinic', slug: `support-${suffix}`, createdBy: ownerId }, { id: otherClinicId, name: 'Other Clinic', slug: `support-other-${suffix}`, createdBy: otherOwnerId }])
  await db.insert(clinicMembers).values([{ id: `m1-${suffix}`, clinicId, userId: ownerId, role: 'owner' }, { id: `m2-${suffix}`, clinicId, userId: dietitianId, role: 'dietitian' }, { id: `m3-${suffix}`, clinicId, userId: assistantId, role: 'assistant' }, { id: `m4-${suffix}`, clinicId: otherClinicId, userId: otherOwnerId, role: 'owner' }])
  await db.insert(platformStaff).values({ id: staffId, userId: staffUserId, role: 'support' })
  return { suffix, ownerId, otherOwnerId, dietitianId, assistantId, staffUserId, clinicId, otherClinicId, staffId }
}

const create = (f: Awaited<ReturnType<typeof fixture>>) => createSupportTicketForClinic(db, { clinicId: f.clinicId, requesterUserId: f.ownerId, clientRequestId: `create-${f.suffix}`, type: 'technical_issue', area: 'desktop_sync', title: 'Senkronizasyon çalışmıyor', reportedImpact: 'major', body: 'Masaüstü uygulamasında senkronizasyon tamamlanmıyor.' })
const actor = (f: Awaited<ReturnType<typeof fixture>>) => ({ actorUserId: f.staffUserId, platformStaffId: f.staffId })

describeWithDb('support ticket integration', () => {
  it('creates an idempotent owner ticket and blocks role/tenant leaks', async () => {
    const f = await fixture(); const [ticket, duplicate] = await Promise.all([create(f), create(f)])
    expect(duplicate.id).toBe(ticket.id)
    expect([ticket.duplicate, duplicate.duplicate].sort()).toEqual([false, true])
    await expect(createSupportTicketForClinic(db, { clinicId: f.clinicId, requesterUserId: f.dietitianId, clientRequestId: `denied-${f.suffix}`, type: 'complaint', area: 'other', otherArea: 'Test', title: 'Yetkisiz talep', reportedImpact: 'minor', body: 'Bu talep rol kontrolünden geçmemelidir.' })).rejects.toThrow('yalnız klinik sahibi')
    await expect(createSupportTicketForClinic(db, { clinicId: f.clinicId, requesterUserId: f.assistantId, clientRequestId: `assistant-denied-${f.suffix}`, type: 'other', area: 'dashboard', title: 'Asistan talebi', reportedImpact: 'minor', body: 'Asistan rolü destek talebi oluşturamamalıdır.' })).rejects.toThrow('yalnız klinik sahibi')
    expect(await getSupportTicketForClinic(db, f.otherClinicId, ticket.id)).toBeNull()
    const clinicDetail = await getSupportTicketForClinic(db, f.clinicId, ticket.id)
    expect(clinicDetail).not.toHaveProperty('triagePriority')
    expect(clinicDetail).not.toHaveProperty('assignedPlatformStaffId')
    await addPlatformSupportMessage(db, { ...actor(f), ticketId: ticket.id, visibility: 'internal', clientRequestId: `internal-${f.suffix}`, body: 'Bu içerik yalnız operasyon ekibine aittir.' })
    const clinicMessages = await getPublicSupportMessagesForClinic(db, f.clinicId, ticket.id)
    expect(JSON.stringify(clinicMessages)).not.toContain('yalnız operasyon ekibine')
    expect(await db.select({ value: count() }).from(supportEmailNotifications).where(eq(supportEmailNotifications.ticketId, ticket.id))).toEqual([{ value: 1 }])
  })

  it('enforces reply, waiting and clinic reopen lifecycle rules', async () => {
    const f = await fixture(); const ticket = await create(f)
    await setSupportTicketPriorityForPlatform(db, { ...actor(f), ticketId: ticket.id, priority: 'P2' })
    await transitionSupportTicketForPlatform(db, { ...actor(f), ticketId: ticket.id, toStatus: 'waiting_for_clinic' })
    const reply = await addClinicSupportReply(db, { clinicId: f.clinicId, userId: f.ownerId, ticketId: ticket.id, clientRequestId: `reply-${f.suffix}`, body: 'İstenen ek operasyon bilgisini paylaşıyorum.' })
    expect(reply.status).toBe('in_progress')
    const resolved = await resolveSupportTicketForPlatform(db, { ...actor(f), ticketId: ticket.id, clientRequestId: `resolve-${f.suffix}`, body: 'Senkronizasyon kuyruğu düzeltildi ve yeniden doğrulandı.' })
    await expect(addClinicSupportReply(db, { clinicId: f.clinicId, userId: f.ownerId, ticketId: ticket.id, clientRequestId: `late-${f.suffix}`, body: 'Normal yanıt olmamalı.' })).rejects.toThrow('normal yanıt')
    const reopened = await reopenSupportTicketForClinic(db, { clinicId: f.clinicId, userId: f.ownerId, ticketId: ticket.id })
    expect(reopened.notificationId).toBeTruthy(); expect(resolved.notificationId).toBeTruthy()
    await transitionSupportTicketForPlatform(db, { ...actor(f), ticketId: ticket.id, toStatus: 'resolved' }).catch((error) => expect(String(error)).toContain('public açıklama'))
    await resolveSupportTicketForPlatform(db, { ...actor(f), ticketId: ticket.id, clientRequestId: `resolve2-${f.suffix}`, body: 'İkinci inceleme tamamlandı ve sorun yeniden çözüldü.' })
    await transitionSupportTicketForPlatform(db, { ...actor(f), ticketId: ticket.id, toStatus: 'closed' })
    await expect(reopenSupportTicketForClinic(db, { clinicId: f.clinicId, userId: f.ownerId, ticketId: ticket.id })).rejects.toThrow('Yalnız çözülmüş')
    await expect(addClinicSupportReply(db, { clinicId: f.clinicId, userId: f.ownerId, ticketId: ticket.id, clientRequestId: `closed-${f.suffix}`, body: 'Kapalı talebe yanıt.' })).rejects.toThrow('normal yanıt')
  })

  it('keeps DB mutations, events and platform audit atomic and validates assignment', async () => {
    const f = await fixture(); const ticket = await create(f)
    const before = await db.select({ value: count() }).from(supportTicketEvents).where(eq(supportTicketEvents.ticketId, ticket.id))
    await expect(setSupportTicketPriorityForPlatform(db, { actorUserId: f.staffUserId, platformStaffId: 'missing-staff', ticketId: ticket.id, priority: 'P1' })).rejects.toThrow()
    expect((await db.select({ priority: supportTickets.triagePriority }).from(supportTickets).where(eq(supportTickets.id, ticket.id)))[0]?.priority).toBeNull()
    expect(await db.select({ value: count() }).from(supportTicketEvents).where(eq(supportTicketEvents.ticketId, ticket.id))).toEqual(before)
    await assignSupportTicketForPlatform(db, { ...actor(f), ticketId: ticket.id, assignedPlatformStaffId: f.staffId })
    expect((await db.select().from(platformAuditLogs).where(and(eq(platformAuditLogs.entityId, ticket.id), eq(platformAuditLogs.action, 'support.ticket.assigned')))).length).toBe(1)
    await expect(transitionSupportTicketForPlatform(db, { ...actor(f), ticketId: ticket.id, toStatus: 'closed' })).rejects.toThrow('Geçersiz durum geçişi')
  })

  it('claims delivery once, records failure, retries once and blocks sent duplicates', async () => {
    const f = await fixture(); const ticket = await create(f); const notificationId = ticket.notificationId!
    expect(await claimSupportNotification(db, notificationId, false)).toBeTruthy(); expect(await claimSupportNotification(db, notificationId, false)).toBeNull()
    await markSupportNotificationFailed(db, notificationId, 'provider unavailable')
    expect(await claimSupportNotification(db, notificationId, true)).toBeTruthy(); await markSupportNotificationSent(db, notificationId)
    expect(await claimSupportNotification(db, notificationId, true)).toBeNull()
    const row = (await db.select().from(supportEmailNotifications).where(eq(supportEmailNotifications.id, notificationId)))[0]!
    expect(row).toMatchObject({ status: 'sent', attemptCount: 2, lastError: null })
  })
})

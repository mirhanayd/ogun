import { createId } from '@paralleldrive/cuid2'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from '../client'
import { accounts, adminSessions, clinicMembers, clinics, deviceSessions, deviceUserLinks, devices, platformAuditLogs, platformStaff, sessions, subscriptions, users } from '../schema'
import { getUserForPlatform, listClinicsForPlatform, listUserSessionsForPlatform, reactivateDeviceForPlatform, registerDesktopDevice, revokeAllUserSessionsForPlatform, revokeDeviceForPlatform, revokeUserSessionForPlatform } from './platform-operations'

const describeWithDb = process.env.PLATFORM_OPERATION_WRITE_TESTS === '1' ? describe : describe.skip

describeWithDb('platform operations integration', () => {
  it('filters clinics and never returns account or session secrets', async () => {
    const suffix = createId()
    const userId = `p2-user-${suffix}`
    const clinicId = `p2-clinic-${suffix}`
    await db.insert(users).values({ id: userId, email: `${suffix}@example.test`, name: 'Phase Two User' })
    await db.insert(accounts).values({ id: `p2-account-${suffix}`, userId, accountId: userId, providerId: 'credential', password: 'must-never-return' })
    await db.insert(clinics).values({ id: clinicId, name: 'Aranan Klinik', slug: `aranan-${suffix}`, createdBy: userId, onboardingCompletedAt: new Date() })
    await db.insert(clinicMembers).values({ id: `p2-member-${suffix}`, clinicId, userId, role: 'owner' })
    await db.insert(subscriptions).values({ id: `p2-sub-${suffix}`, clinicId, planCode: 'klinik', billingCycle: 'yearly', provider: 'manuel' })
    await db.insert(sessions).values({ id: `p2-session-${suffix}`, token: `secret-${suffix}`, userId, activeClinicId: clinicId, role: 'owner', expiresAt: new Date(Date.now() + 60_000) })

    const result = await listClinicsForPlatform(db, { search: 'Aranan', plan: 'klinik', status: 'trialing', billingCycle: 'yearly', onboarding: 'complete', pageSize: 25 })
    expect(result.rows.some((row) => row.id === clinicId)).toBe(true)
    expect(await getUserForPlatform(db, userId)).not.toHaveProperty('password')
    expect((await listUserSessionsForPlatform(db, userId))[0]).not.toHaveProperty('token')
  })

  it('rolls back failed audit writes and preserves admin sessions', async () => {
    const suffix = createId()
    const actorId = `p2-actor-${suffix}`
    const targetId = `p2-target-${suffix}`
    const staffId = `p2-staff-${suffix}`
    await db.insert(users).values([{ id: actorId, email: `actor-${suffix}@example.test`, name: 'Actor' }, { id: targetId, email: `target-${suffix}@example.test`, name: 'Target' }])
    await db.insert(platformStaff).values({ id: staffId, userId: actorId, role: 'super_admin' })
    await db.insert(sessions).values([{ id: `normal-a-${suffix}`, token: `normal-a-token-${suffix}`, userId: targetId, expiresAt: new Date(Date.now() + 60_000) }, { id: `normal-b-${suffix}`, token: `normal-b-token-${suffix}`, userId: targetId, expiresAt: new Date(Date.now() + 60_000) }])
    await db.insert(adminSessions).values({ id: `admin-${suffix}`, token: `admin-token-${suffix}`, userId: targetId, expiresAt: new Date(Date.now() + 60_000) })

    await expect(revokeUserSessionForPlatform(db, { actorUserId: actorId, platformStaffId: 'missing-staff', userId: targetId, sessionId: `normal-a-${suffix}` })).rejects.toThrow()
    expect((await db.select().from(sessions).where(eq(sessions.id, `normal-a-${suffix}`))).length).toBe(1)
    await revokeUserSessionForPlatform(db, { actorUserId: actorId, platformStaffId: staffId, userId: targetId, sessionId: `normal-a-${suffix}` })
    await revokeAllUserSessionsForPlatform(db, { actorUserId: actorId, platformStaffId: staffId, userId: targetId })
    expect((await db.select().from(sessions).where(eq(sessions.userId, targetId))).length).toBe(0)
    expect((await db.select().from(adminSessions).where(eq(adminSessions.userId, targetId))).length).toBe(1)
  })

  it('supports multi-user device links and only revokes bound sessions', async () => {
    const suffix = createId()
    const actorId = `p2-device-actor-${suffix}`
    const firstUser = `p2-device-user-a-${suffix}`
    const secondUser = `p2-device-user-b-${suffix}`
    const staffId = `p2-device-staff-${suffix}`
    await db.insert(users).values([{ id: actorId, email: `da-${suffix}@example.test`, name: 'Actor' }, { id: firstUser, email: `du1-${suffix}@example.test`, name: 'One' }, { id: secondUser, email: `du2-${suffix}@example.test`, name: 'Two' }])
    await db.insert(platformStaff).values({ id: staffId, userId: actorId, role: 'super_admin' })
    await db.insert(sessions).values([{ id: `device-session-a-${suffix}`, token: `dsa-${suffix}`, userId: firstUser, expiresAt: new Date(Date.now() + 60_000) }, { id: `device-session-b-${suffix}`, token: `dsb-${suffix}`, userId: secondUser, expiresAt: new Date(Date.now() + 60_000) }, { id: `other-session-${suffix}`, token: `other-${suffix}`, userId: firstUser, expiresAt: new Date(Date.now() + 60_000) }])
    const common = { installationIdHash: `hash-${suffix}`, platform: 'windows', displayName: 'Windows Desktop', appVersion: '1.0.0' }
    const first = await registerDesktopDevice(db, { ...common, userId: firstUser, sessionId: `device-session-a-${suffix}` })
    const second = await registerDesktopDevice(db, { ...common, userId: secondUser, sessionId: `device-session-b-${suffix}` })
    expect(second.id).toBe(first.id)
    expect((await db.select().from(deviceUserLinks).where(eq(deviceUserLinks.deviceId, first.id))).length).toBe(2)
    expect((await db.select().from(deviceSessions).where(eq(deviceSessions.deviceId, first.id))).length).toBe(2)
    await revokeDeviceForPlatform(db, { actorUserId: actorId, platformStaffId: staffId, deviceId: first.id, reason: 'Test iptali' })
    expect((await db.select().from(sessions).where(eq(sessions.id, `other-session-${suffix}`))).length).toBe(1)
    expect((await registerDesktopDevice(db, { ...common, userId: firstUser, sessionId: `other-session-${suffix}` })).status).toBe('revoked')
    await reactivateDeviceForPlatform(db, { actorUserId: actorId, platformStaffId: staffId, deviceId: first.id })
    expect((await db.select({ status: devices.status }).from(devices).where(eq(devices.id, first.id)))[0]?.status).toBe('active')
    expect((await db.select().from(platformAuditLogs).where(eq(platformAuditLogs.entityId, first.id))).map((row) => row.action)).toEqual(expect.arrayContaining(['device.registered', 'device.revoked', 'device.reactivated']))
  })
})

import { randomUUID } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../client'
import {
  appointments, clinicMembers, clinics, clients, deviceUserLinks, devices, dietPlans,
  documents, recipes, supportTickets, users,
} from '../schema'
import { getAppointmentById } from './appointments'
import { getClientById } from './clients'
import { getClinicMembership } from './clinics'
import { getDocumentById } from './documents'
import { getPlanById } from './plans'
import { getDeviceForUser } from './platform-operations'
import { getRecipeNamesByIds } from './recipes'
import { getSupportTicketForClinic } from './support'

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip

describeWithDatabase('Phase 8 cross-clinic IDOR regression fixture', () => {
  let db: Database
  const suffix = randomUUID()
  const userA = `idor-user-a-${suffix}`
  const userB = `idor-user-b-${suffix}`
  const clinicA = `idor-clinic-a-${suffix}`
  const clinicB = `idor-clinic-b-${suffix}`
  const clientB = `idor-client-b-${suffix}`
  const appointmentB = `idor-appointment-b-${suffix}`
  const documentB = `idor-document-b-${suffix}`
  const planB = `idor-plan-b-${suffix}`
  const ticketB = `idor-ticket-b-${suffix}`
  const recipeB = `idor-recipe-b-${suffix}`
  const deviceB = `idor-device-b-${suffix}`

  beforeAll(async () => {
    ;({ db } = await import('../client'))
    const now = new Date()
    await db.insert(users).values([
      { id: userA, email: `a-${suffix}@idor.test`, name: 'Clinic A Owner', emailVerified: true },
      { id: userB, email: `b-${suffix}@idor.test`, name: 'Clinic B Owner', emailVerified: true },
    ])
    await db.insert(clinics).values([
      { id: clinicA, name: 'IDOR Clinic A', slug: `idor-a-${suffix}`, createdBy: userA },
      { id: clinicB, name: 'IDOR Clinic B', slug: `idor-b-${suffix}`, createdBy: userB },
    ])
    await db.insert(clinicMembers).values([
      { id: `idor-member-a-${suffix}`, clinicId: clinicA, userId: userA, role: 'owner' },
      { id: `idor-member-b-${suffix}`, clinicId: clinicB, userId: userB, role: 'owner' },
    ])
    await db.insert(clients).values({ id: clientB, clinicId: clinicB, firstName: 'Secret', lastName: 'Client' })
    await db.insert(appointments).values({ id: appointmentB, clinicId: clinicB, clientId: clientB, dietitianId: userB, startsAt: now, endsAt: new Date(now.getTime() + 3_600_000) })
    await db.insert(documents).values({ id: documentB, clientId: clientB, fileName: 'secret.pdf', mimeType: 'application/pdf', sizeBytes: 10, storageKey: `documents/${suffix}/secret.pdf`, category: 'tahlil', uploadedBy: userB })
    await db.insert(dietPlans).values({ id: planB, clinicId: clinicB, clientId: clientB, name: 'Secret Plan', createdBy: userB })
    await db.insert(supportTickets).values({ id: ticketB, referenceCode: `IDOR-${suffix}`, clinicId: clinicB, requesterUserId: userB, clientRequestId: `idor-${suffix}`, type: 'technical_issue', area: 'dashboard', title: 'Secret Ticket', reportedImpact: 'minor' })
    await db.insert(recipes).values({ id: recipeB, clinicId: clinicB, nameTr: 'Secret Recipe' })
    await db.insert(devices).values({ id: deviceB, installationIdHash: `hash-${suffix}`, platform: 'windows', displayName: 'Clinic B device', appVersion: '1.0.0' })
    await db.insert(deviceUserLinks).values({ id: `idor-link-${suffix}`, deviceId: deviceB, userId: userB })
  })

  afterAll(async () => {
    await db.delete(deviceUserLinks).where(eq(deviceUserLinks.deviceId, deviceB))
    await db.delete(devices).where(eq(devices.id, deviceB))
    await db.delete(recipes).where(eq(recipes.id, recipeB))
    await db.delete(supportTickets).where(eq(supportTickets.id, ticketB))
    await db.delete(dietPlans).where(eq(dietPlans.id, planB))
    await db.delete(documents).where(eq(documents.id, documentB))
    await db.delete(appointments).where(eq(appointments.id, appointmentB))
    await db.delete(clients).where(eq(clients.id, clientB))
    await db.delete(clinicMembers).where(inArray(clinicMembers.clinicId, [clinicA, clinicB]))
    await db.delete(clinics).where(inArray(clinics.id, [clinicA, clinicB]))
    await db.delete(users).where(inArray(users.id, [userA, userB]))
  })

  it('denies Clinic A reads of every Clinic B object class', async () => {
    await expect(getClientById(db, clinicA, clientB)).resolves.toBeNull()
    await expect(getAppointmentById(db, clinicA, appointmentB)).resolves.toBeNull()
    await expect(getDocumentById(db, clinicA, documentB)).resolves.toBeNull()
    await expect(getPlanById(db, clinicA, planB)).resolves.toBeNull()
    await expect(getSupportTicketForClinic(db, clinicA, ticketB)).resolves.toBeNull()
    await expect(getClinicMembership(db, clinicA, userB)).resolves.toBeNull()
    await expect(getRecipeNamesByIds(db, clinicA, [recipeB])).resolves.toEqual(new Map())
    await expect(getDeviceForUser(db, userA, deviceB)).resolves.toBeNull()
  })

  it('proves the fixture resources exist for their rightful Clinic B principals', async () => {
    expect(await getClientById(db, clinicB, clientB)).not.toBeNull()
    expect(await getAppointmentById(db, clinicB, appointmentB)).not.toBeNull()
    expect(await getDocumentById(db, clinicB, documentB)).not.toBeNull()
    expect(await getPlanById(db, clinicB, planB)).not.toBeNull()
    expect(await getSupportTicketForClinic(db, clinicB, ticketB)).not.toBeNull()
    expect(await getClinicMembership(db, clinicB, userB)).not.toBeNull()
    expect(await getRecipeNamesByIds(db, clinicB, [recipeB])).toEqual(new Map([[recipeB, 'Secret Recipe']]))
    expect(await getDeviceForUser(db, userB, deviceB)).not.toBeNull()
  })
})

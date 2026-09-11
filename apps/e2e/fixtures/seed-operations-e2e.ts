import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { hashPassword } from 'better-auth/crypto'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import {
  accounts,
  clinics,
  operationalFindings,
  operationalJobRuns,
  platformStaff,
  subscriptionEmailNotifications,
  subscriptionEvents,
  users,
} from '@ogun/db/schema'
import { assertLocalDatabaseTarget } from '@ogun/db/database-target'

const PASSWORD = 'Operations2026!'

async function main() {
  assertLocalDatabaseTarget(process.env.DATABASE_URL, 'E2E fixture writes')
  const client = postgres(process.env.DATABASE_URL!)
  const db = drizzle(client)
  const suffix = Date.now().toString(36)
  const password = await hashPassword(PASSWORD)
  const [manager, reader, denied, owner] = await db
    .insert(users)
    .values([
      { email: `ops-manager-${suffix}@ogun.test`, name: 'E2E Ops Manager', emailVerified: true },
      { email: `ops-reader-${suffix}@ogun.test`, name: 'E2E Ops Reader', emailVerified: true },
      { email: `ops-denied-${suffix}@ogun.test`, name: 'E2E Clinical Ops', emailVerified: true },
      { email: `ops-owner-${suffix}@ogun.test`, name: 'E2E Clinic Owner', emailVerified: true },
    ])
    .returning()
  if (!manager || !reader || !denied || !owner) throw new Error('Users could not be seeded')
  await db
    .insert(accounts)
    .values(
      [manager, reader, denied].map((user) => ({
        userId: user.id,
        accountId: user.id,
        providerId: 'credential',
        password,
      })),
    )
  await db.insert(platformStaff).values([
    { userId: manager.id, role: 'super_admin', createdBy: manager.id },
    { userId: reader.id, role: 'read_only', createdBy: manager.id },
    { userId: denied.id, role: 'clinical_ops', createdBy: manager.id },
  ])
  const [clinic] = await db
    .insert(clinics)
    .values({
      name: `E2E Drift Clinic ${suffix}`,
      slug: `e2e-drift-${suffix}`,
      createdBy: owner.id,
      subscriptionStatus: 'active',
    })
    .returning()
  if (!clinic) throw new Error('Clinic could not be seeded')
  const now = new Date()
  const [event] = await db
    .insert(subscriptionEvents)
    .values({ clinicId: clinic.id, eventType: 'fixture', source: 'system' })
    .returning()
  await db
    .insert(subscriptionEmailNotifications)
    .values({
      clinicId: clinic.id,
      subscriptionEventId: event!.id,
      recipientUserId: owner.id,
      recipientEmail: owner.email,
    })
  await db
    .insert(operationalJobRuns)
    .values({
      jobName: 'email_retry',
      trigger: 'test',
      status: 'success',
      startedAt: new Date(now.getTime() - 1000),
      finishedAt: now,
      attemptedCount: 1,
      succeededCount: 1,
    })
  await db
    .insert(operationalFindings)
    .values({
      kind: 'fixture_warning',
      severity: 'warning',
      entityType: 'clinic',
      entityId: clinic.id,
      clinicId: clinic.id,
      fingerprint: `fixture:${clinic.id}`,
      firstSeenAt: now,
      lastSeenAt: now,
      summary: 'E2E güvenli operasyon uyarısı.',
      metadata: { reasonCode: 'fixture' },
    })
  writeFileSync(
    path.resolve(__dirname, '.operations-credentials.json'),
    JSON.stringify({
      manager: { email: manager.email, password: PASSWORD },
      reader: { email: reader.email, password: PASSWORD },
      denied: { email: denied.email, password: PASSWORD },
    }),
    'utf8',
  )
  await client.end()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

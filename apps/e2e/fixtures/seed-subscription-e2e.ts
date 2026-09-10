import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { hashPassword } from 'better-auth/crypto'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import {
  accounts,
  clinicMembers,
  clinics,
  platformStaff,
  subscriptions,
  users,
} from '@ogun/db/schema'

const PASSWORD = 'BillingOps2026!'

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL is required')
  const client = postgres(databaseUrl)
  const db = drizzle(client)
  const suffix = Date.now().toString(36)
  const billingEmail = `billing-ops-${suffix}@ogun.test`
  const supportEmail = `support-${suffix}@ogun.test`
  const ownerEmail = `owner-${suffix}@ogun.test`
  const [billing, support, owner] = await db
    .insert(users)
    .values([
      { email: billingEmail, name: 'E2E Billing Ops', emailVerified: true },
      { email: supportEmail, name: 'E2E Support', emailVerified: true },
      { email: ownerEmail, name: 'E2E Clinic Owner', emailVerified: true },
    ])
    .returning()
  if (!billing || !support || !owner) throw new Error('Users could not be seeded')
  const password = await hashPassword(PASSWORD)
  await db.insert(accounts).values([
    { userId: billing.id, accountId: billing.id, providerId: 'credential', password },
    { userId: support.id, accountId: support.id, providerId: 'credential', password },
  ])
  await db.insert(platformStaff).values([
    { userId: billing.id, role: 'billing_ops', createdBy: billing.id },
    { userId: support.id, role: 'support', createdBy: billing.id },
  ])
  const [trial, external] = await db
    .insert(clinics)
    .values([
      {
        name: `Faz 6 Manuel Klinik ${suffix}`,
        slug: `phase6-manual-${suffix}`,
        createdBy: owner.id,
        subscriptionStatus: 'trialing',
        trialEndsAt: new Date(Date.now() + 3 * 86400000),
      },
      {
        name: `Faz 6 Iyzico Klinik ${suffix}`,
        slug: `phase6-iyzico-${suffix}`,
        createdBy: owner.id,
        subscriptionStatus: 'active',
      },
    ])
    .returning()
  if (!trial || !external) throw new Error('Clinics could not be seeded')
  await db.insert(clinicMembers).values([
    { clinicId: trial.id, userId: owner.id, role: 'owner' },
    { clinicId: external.id, userId: owner.id, role: 'owner' },
  ])
  await db.insert(subscriptions).values([
    {
      clinicId: trial.id,
      planCode: 'başlangıç',
      billingCycle: 'monthly',
      provider: 'manuel',
      providerSubscriptionId: `manual-${suffix}`,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
    },
    {
      clinicId: external.id,
      planCode: 'klinik',
      billingCycle: 'monthly',
      provider: 'iyzico',
      providerCustomerId: `customer-${suffix}`,
      providerSubscriptionId: `iyzico-${suffix}`,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
    },
  ])
  writeFileSync(
    path.resolve(__dirname, '.subscription-credentials.json'),
    JSON.stringify({
      billing: { email: billingEmail, password: PASSWORD },
      support: { email: supportEmail, password: PASSWORD },
      trialClinic: { id: trial.id, name: trial.name },
      externalClinic: { id: external.id, name: external.name },
    }),
    'utf8',
  )
  await client.end()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

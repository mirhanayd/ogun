import { writeFileSync } from 'node:fs'
import path from 'node:path'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { hashPassword } from 'better-auth/crypto'
import {
  accounts,
  clinicalReviewTasks,
  clinicalSources,
  medicationSubstances,
  platformStaff,
  users,
} from '@ogun/db/schema'
import { assertLocalDatabaseTarget } from '@ogun/db/database-target'

const ADMIN_PASSWORD = 'ClinicalOps2026!'
const EXISTING_PASSWORD = 'ExistingReviewer2026!'
async function main() {
  const databaseUrl = process.env.DATABASE_URL
  assertLocalDatabaseTarget(databaseUrl, 'E2E fixture writes')
  const sql = postgres(databaseUrl!)
  const db = drizzle(sql)
  const suffix = Date.now().toString(36)
  const adminEmail = `clinical-ops-${suffix}@ogun.test`
  const existingEmail = `existing-reviewer-${suffix}@ogun.test`
  const newEmail = `new-reviewer-${suffix}@ogun.test`
  const revokedEmail = `revoked-reviewer-${suffix}@ogun.test`
  const [admin, existing] = await db
    .insert(users)
    .values([
      { email: adminEmail, name: 'E2E Clinical Ops', emailVerified: true },
      { email: existingEmail, name: 'E2E Existing Reviewer', emailVerified: true },
    ])
    .returning()
  if (!admin || !existing) throw new Error('Users not seeded')
  await db.insert(accounts).values([
    {
      userId: admin.id,
      accountId: admin.id,
      providerId: 'credential',
      password: await hashPassword(ADMIN_PASSWORD),
    },
    {
      userId: existing.id,
      accountId: existing.id,
      providerId: 'credential',
      password: await hashPassword(EXISTING_PASSWORD),
    },
  ])
  await db
    .insert(platformStaff)
    .values({ userId: admin.id, role: 'clinical_ops', createdBy: admin.id })
  const sourceId = `e2e-clinical-source-${suffix}`,
    substanceId = `e2e-substance-${suffix}`
  await db
    .insert(clinicalSources)
    .values({ id: sourceId, code: sourceId, name: 'E2E Clinical Source' })
  await db.insert(medicationSubstances).values({
    id: substanceId,
    nameTr: 'E2E Etken Madde',
    normalizedName: substanceId,
    searchText: 'e2e',
    sourceId,
    mappingMethod: 'manual',
  })
  const tasks = [1, 2].map((i) => ({
    id: `e2e-review-task-${suffix}-${i}`,
    sourceSystem: 'e2e',
    candidateId: `e2e-candidate-${suffix}-${i}`,
    candidateSemanticHash: `e2e-hash-${suffix}-${i}`,
    subjectType: 'medication',
    medicationSubstanceId: substanceId,
    targetType: 'food',
    targetKey: `e2e_food_${i}`,
    action: 'caution',
    candidateConfidence: 'high',
    reviewPriority: i === 1 ? 'P1' : 'P2',
    requiredCapability: 'medication_food',
    status: 'pending',
    artifactLocator: `artifact://e2e/${suffix}/${i}`,
  }))
  await db.insert(clinicalReviewTasks).values(tasks)
  const credentials = {
    admin: { email: adminEmail, password: ADMIN_PASSWORD },
    existing: { email: existingEmail, password: EXISTING_PASSWORD },
    newReviewer: { email: newEmail, password: 'NewReviewer2026!' },
    revokedReviewer: { email: revokedEmail },
    taskIds: tasks.map((t) => t.id),
  }
  writeFileSync(
    path.resolve(__dirname, '.clinical-review-credentials.json'),
    JSON.stringify(credentials, null, 2),
    'utf8',
  )
  await sql.end()
}
main().catch((error) => {
  console.error(error)
  process.exit(1)
})

import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { hashPassword } from 'better-auth/crypto'
import { accounts, users, clinics, clinicMembers, clients, clientHealth, measurements, appointments } from '@ogun/db/schema'
import * as schema from '@ogun/db/schema'
import { replaceClientConditions, replaceClientMedications } from '@ogun/db/queries'

// Copies ONLY public reference catalogs from the configured source, read-only.
// All identity/patient test writes are confined to the explicitly named local DB.
async function main() {
  process.loadEnvFile(new URL('../../../.env', import.meta.url))
  const sourceUrl = process.env.CLINICAL_SOURCE_DATABASE_URL ?? process.env.DATABASE_URL
  if (!sourceUrl) throw new Error('Canonical source database is required')
  const targetUrl = process.env.DESKTOP_SMOKE_DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5433/ogun_patch_034'
  const targetLocation = new URL(targetUrl)
  if (!['localhost', '127.0.0.1'].includes(targetLocation.hostname) || targetLocation.pathname !== '/ogun_patch_034') {
    throw new Error('Smoke writes require the dedicated local ogun_patch_034 database')
  }
  const source = postgres(sourceUrl, { max: 2 })
  const target = postgres(targetUrl, { max: 2 })
  try {
    for (const table of ['clinical_sources', 'conditions', 'condition_aliases', 'medication_substances', 'medication_substance_aliases', 'medication_products', 'medication_product_aliases', 'medication_product_substances']) {
      const existing = await target`select count(*)::int as count from ${target(table)}`
      if (existing[0]?.count > 0) { console.log(`${table}: already copied (${existing[0]?.count})`); continue }
      await source.begin('read only', async (reader) => {
        let copied = 0
        for await (const rows of reader`select * from ${reader(table)}`.cursor(2000)) {
          await target`insert into ${target(table)} select * from json_populate_recordset(null::${target(table)}, ${target.json(rows)}::json) on conflict do nothing`
          copied += rows.length
        }
        console.log(`${table}: ${copied} canonical rows copied`)
      })
    }
    const db = drizzle(target, { schema })
    // Existing plan/PDF regressions require real food reference rows as well.
    // Copy a bounded public subset and remap seeded definition IDs by code.
    const foodRows = await source`select * from foods where created_by is null and name_tr ilike '%a%' and search_text like '%e%' order by id limit 25`
    const sourceDefinitions = await source`select id, code from data_sources`
    const targetDefinitions = await target`select id, code from data_sources`
    const sourceMap = new Map(sourceDefinitions.map((row) => [row.id, targetDefinitions.find((item) => item.code === row.code)?.id]))
    const nutrientDefinitions = await target`select id, code from nutrients`
    for (const food of foodRows) {
      const row = { ...food, source_id: sourceMap.get(food.source_id) }
      if (!row.source_id) throw new Error('Seed local data sources before preparing smoke')
      await target`insert into foods select * from json_populate_record(null::foods, ${JSON.stringify(row)}::text::json) on conflict do nothing`
      const values = await source`select fn.*, n.code from food_nutrients fn join nutrients n on n.id=fn.nutrient_id where fn.food_id=${food.id}`
      const mapped = values.map(({ code, ...value }) => ({ ...value, nutrient_id: nutrientDefinitions.find((n) => n.code === code)?.id, source_id: sourceMap.get(value.source_id) })).filter((value) => value.nutrient_id && value.source_id)
      if (mapped.length) await target`insert into food_nutrients select * from json_populate_recordset(null::food_nutrients, ${JSON.stringify(mapped)}::text::json) on conflict do nothing`
    }
    console.log(`${foodRows.length} real public foods copied for plan/PDF regression`)
    const suffix = Date.now().toString(36)
    const password = 'ReleaseSmoke034!'
    const passwordHash = await hashPassword(password)
    const people = []
    for (const role of ['owner', 'dietitian', 'assistant'] as const) {
      const [user] = await db.insert(users).values({ name: `Release Test ${role}`, email: `release-${role}-${suffix}@ogun.test`, emailVerified: true }).returning()
      if (!user) throw new Error('Missing test user')
      await db.insert(accounts).values({ userId: user.id, accountId: user.id, providerId: 'credential', password: passwordHash })
      people.push({ ...user, role })
    }
    const owner = people[0]!
    const dietitian = people[1]!
    const [clinic] = await db.insert(clinics).values({ name: 'Öğün Sürüm Doğrulama Kliniği', slug: `release-smoke-${suffix}`, createdBy: owner.id, onboardingStep: 3, onboardingCompletedAt: new Date(), subscriptionStatus: 'active', primaryColor: '#6D4AFF', logoUrl: 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" rx="20" fill="#6D4AFF"/><text x="40" y="55" text-anchor="middle" font-size="48" fill="white">Ö</text></svg>').toString('base64') }).returning()
    if (!clinic) throw new Error('Missing test clinic')
    for (const user of people) await db.insert(clinicMembers).values({ userId: user.id, clinicId: clinic.id, role: user.role, joinedAt: new Date() })
    const [client] = await db.insert(clients).values({ clinicId: clinic.id, firstName: 'Sürüm', lastName: 'Doğrulama', birthDate: '1990-01-01', status: 'aktif', assignedDietitianId: dietitian.id, kvkkConsentAt: new Date(), explicitConsentAt: new Date() }).returning()
    if (!client) throw new Error('Missing test client')
    const [condition] = await target`select id, name_tr from conditions where is_active and search_text like '%diyabet%' order by length(name_tr), id limit 1`
    const [product] = await target`select id, name from medication_products where is_selectable and name ilike 'PAROL%' order by length(name), id limit 1`
    const [substance] = await target`select id, name_tr from medication_substances where search_text like '%metfor%' order by length(name_tr), id limit 1`
    if (!condition || !product || !substance) throw new Error('Required canonical source entries not found')
    await db.insert(clientHealth).values({ clientId: client.id, conditions: [condition.name_tr], medications: [product.name] })
    await replaceClientConditions(db, clinic.id, client.id, [{ conditionId: condition.id }])
    await replaceClientMedications(db, clinic.id, client.id, [{ medicationProductId: product.id }])
    await db.insert(measurements).values({ clientId: client.id, measuredAt: new Date('2026-08-25T09:00:00Z'), weightKg: '77.2', source: 'manuel', recordedBy: owner.id })
    await db.insert(appointments).values({ clinicId: clinic.id, clientId: client.id, dietitianId: dietitian.id, startsAt: new Date('2026-08-28T09:00:00Z'), endsAt: new Date('2026-08-28T09:30:00Z'), status: 'geldi', type: 'kontrol' })
    const output = resolve(import.meta.dirname, '../../desktop/src-tauri/target/release-smoke/fixture.json')
    await mkdir(resolve(import.meta.dirname, '../../desktop/src-tauri/target/release-smoke'), { recursive: true })
    await writeFile(output, JSON.stringify({ clinic, client, people: people.map(({ id, name, email, role }) => ({ id, name, email, role })), password, condition, product, substance }, null, 2))
    console.log(`Smoke fixture ready: ${output}`)
  } finally { await source.end(); await target.end() }
}
main().catch((error) => { console.error(error.stack ?? error.message); process.exitCode = 1 })

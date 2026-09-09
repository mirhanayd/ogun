import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { hashPassword } from 'better-auth/crypto'
import { inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { accounts, nutrients, platformStaff, users } from '@ogun/db/schema'

const PASSWORD = 'FoodEditor2026!'

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL is required')

  const sql = postgres(databaseUrl)
  const db = drizzle(sql)
  const suffix = Date.now().toString(36)
  const email = `food-editor-${suffix}@ogun.test`
  const [user] = await db
    .insert(users)
    .values({ email, name: 'E2E Food Editor', emailVerified: true })
    .returning()
  if (!user) throw new Error('Food editor could not be seeded')

  await db.insert(accounts).values({
    userId: user.id,
    accountId: user.id,
    providerId: 'credential',
    password: await hashPassword(PASSWORD),
  })
  await db
    .insert(platformStaff)
    .values({ userId: user.id, role: 'food_editor', createdBy: user.id })

  const definitions = await db
    .select({ id: nutrients.id, code: nutrients.code })
    .from(nutrients)
    .where(inArray(nutrients.code, ['ENERC_KCAL', 'PROCNT', 'CHOCDF', 'FAT', 'VITC']))
  const nutrientIds = Object.fromEntries(definitions.map((item) => [item.code, item.id]))
  for (const code of ['ENERC_KCAL', 'PROCNT', 'CHOCDF', 'FAT', 'VITC'])
    if (!nutrientIds[code]) throw new Error(`Canonical nutrient is missing: ${code}`)

  writeFileSync(
    path.resolve(__dirname, '.food-catalog-credentials.json'),
    JSON.stringify({
      admin: { email, password: PASSWORD },
      suffix,
      publishedFoodName: `E2E Yayın Besini ${suffix}`,
      draftFoodName: `E2E Taslak Besini ${suffix}`,
      recipeName: `E2E Sistem Tarifi ${suffix}`,
      nutrientIds,
    }),
    'utf8',
  )
  await sql.end()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { dataSources, exchangeGroups, nutrients } from '../schema'
import { dataSourcesSeed } from './data-sources'
import { exchangeGroupsSeed } from './exchange-groups'
import { nutrientsSeed } from './nutrients'

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set')
  }

  const client = postgres(databaseUrl)
  const db = drizzle(client)

  const insertedNutrients = await db
    .insert(nutrients)
    .values(nutrientsSeed)
    .onConflictDoNothing({ target: nutrients.code })
    .returning({ code: nutrients.code })

  const insertedGroups = await db
    .insert(exchangeGroups)
    .values(exchangeGroupsSeed)
    .onConflictDoNothing({ target: exchangeGroups.code })
    .returning({ code: exchangeGroups.code })

  const insertedSources = await db
    .insert(dataSources)
    .values(dataSourcesSeed)
    .onConflictDoNothing({ target: dataSources.code })
    .returning({ code: dataSources.code })

  console.log(
    `Seed tamamlandı: ${insertedNutrients.length}/${nutrientsSeed.length} besin öğesi, ` +
      `${insertedGroups.length}/${exchangeGroupsSeed.length} değişim grubu, ` +
      `${insertedSources.length}/${dataSourcesSeed.length} veri kaynağı eklendi ` +
      `(zaten var olanlar atlandı).`,
  )

  await client.end()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

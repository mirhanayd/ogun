/** Staging-only bootstrap prerequisite for the initial Drizzle migration.
 *
 * 0000_chemical_mad_thinker.sql uses gin_trgm_ops; PostgreSQL only provides
 * that operator class after pg_trgm has been installed in the database.
 *
 * This script is deliberately restricted to the separate Ogun staging Neon
 * endpoint. Never use it for production or test fixtures.
 */
import postgres from 'postgres'
import { assertDatabaseWriteTarget } from '../database-target'

const STAGING_HOST = 'ep-snowy-field-b17y5klp.c-5.eu-central-1.aws.neon.tech'
const STAGING_DATABASE = 'neondb'
const databaseUrl = process.env.DATABASE_URL
const target = assertDatabaseWriteTarget({ operation: 'migrate', databaseUrl })
if (
  process.env.DB_WRITE_TARGET !== 'staging' ||
  target.hostname !== STAGING_HOST ||
  target.database !== STAGING_DATABASE ||
  target.port !== '5432'
) {
  throw new Error('Refusing pg_trgm setup: target is not the verified Ogun staging database.')
}

const sql = postgres(databaseUrl!, { ssl: 'require', max: 1, connect_timeout: 10 })
try {
  await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public`
  const [status] = await sql<{ extension_version: string | null; gin_trgm_available: boolean }[]>`
    SELECT
      (SELECT extversion FROM pg_extension WHERE extname = 'pg_trgm') AS extension_version,
      EXISTS (SELECT 1 FROM pg_opclass WHERE opcname = 'gin_trgm_ops') AS gin_trgm_available
  `
  if (!status?.extension_version || !status.gin_trgm_available) {
    throw new Error('pg_trgm prerequisite is unavailable after installation.')
  }
  console.log(`Ogun staging prerequisite ready: pg_trgm ${status.extension_version}; gin_trgm_ops available.`)
} finally {
  await sql.end()
}

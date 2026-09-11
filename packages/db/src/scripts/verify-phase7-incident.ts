import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { describeDatabaseTarget, parseDatabaseTarget } from '../database-target'

const migrationFiles = {
  '0037_cool_madripoor': new URL('../../drizzle/0037_cool_madripoor.sql', import.meta.url),
  '0038_backfill-provider-event-namespace': new URL(
    '../../drizzle/0038_backfill-provider-event-namespace.sql',
    import.meta.url,
  ),
}

async function migrationHash(url: URL) {
  return createHash('sha256')
    .update(await readFile(fileURLToPath(url)))
    .digest('hex')
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  const target = parseDatabaseTarget(databaseUrl)
  for (const line of describeDatabaseTarget(target)) console.log(line)
  console.log('Environment classification: UNKNOWN (no trusted deployment metadata was queried)')
  console.log('Verification mode: read-only aggregate/schema checks; no row content is selected')

  const hash0037 = await migrationHash(migrationFiles['0037_cool_madripoor'])
  const hash0038 = await migrationHash(migrationFiles['0038_backfill-provider-event-namespace'])
  const sql = postgres(databaseUrl!, { max: 1, ssl: target.isLocal ? 'prefer' : 'require' })

  try {
    const report = await sql.begin('read only', async (tx) => {
      const appliedRows = await tx<{ hash: string }[]>`
        SELECT hash FROM drizzle.__drizzle_migrations
        WHERE hash IN (${hash0037}, ${hash0038})
      `
      const applied = new Set(appliedRows.map((row) => row.hash))

      const objects = await tx<{ name: string; present: boolean }[]>`
        SELECT name, to_regclass('public.' || name) IS NOT NULL AS present
        FROM unnest(ARRAY[
          'operational_findings',
          'operational_job_leases',
          'operational_job_runs',
          'provider_webhook_receipts',
          'sms_reminder_deliveries'
        ]) AS name
        ORDER BY name
      `
      const [providerColumn] = await tx<{ present: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'subscription_events'
            AND column_name = 'provider'
        ) AS present
      `
      const [fixtures] = await tx<{ count: number }[]>`
        SELECT sum(item_count)::int AS count
        FROM (
          SELECT count(*) AS item_count FROM users WHERE id LIKE 's7-%'
          UNION ALL SELECT count(*) FROM clinics WHERE id LIKE 's7-%'
          UNION ALL SELECT count(*) FROM clinic_members WHERE id LIKE 's7-%'
          UNION ALL SELECT count(*) FROM clients WHERE id LIKE 's7-%'
          UNION ALL SELECT count(*) FROM appointments WHERE id LIKE 's7-%'
          UNION ALL SELECT count(*) FROM subscriptions WHERE id LIKE 's7-%'
          UNION ALL SELECT count(*) FROM sms_reminder_deliveries
            WHERE id LIKE 's7-%' OR clinic_id LIKE 's7-%' OR appointment_id LIKE 's7-%' OR client_id LIKE 's7-%'
          UNION ALL SELECT count(*) FROM sms_logs
            WHERE id LIKE 's7-%' OR clinic_id LIKE 's7-%' OR appointment_id LIKE 's7-%' OR client_id LIKE 's7-%'
          UNION ALL SELECT count(*) FROM subscription_events
            WHERE id LIKE 's7-%' OR clinic_id LIKE 's7-%' OR subscription_id LIKE 's7-%'
          UNION ALL SELECT count(*) FROM subscription_email_notifications
            WHERE id LIKE 's7-%' OR clinic_id LIKE 's7-%' OR subscription_event_id LIKE 's7-%'
              OR recipient_user_id LIKE 's7-%'
          UNION ALL SELECT count(*) FROM provider_webhook_receipts
            WHERE id LIKE 's7-%' OR coalesce(metadata->>'subscriptionId', '') LIKE 's7-%'
          UNION ALL SELECT count(*) FROM operational_findings
            WHERE id LIKE 's7-%' OR entity_id LIKE 's7-%' OR coalesce(metadata::text, '') LIKE '%s7-%'
          UNION ALL SELECT count(*) FROM operational_job_runs
            WHERE id LIKE 's7-%' OR coalesce(metadata::text, '') LIKE '%s7-%'
        ) counts
      `

      return {
        migrations: {
          '0037_cool_madripoor': applied.has(hash0037),
          '0038_backfill-provider-event-namespace': applied.has(hash0038),
        },
        schemaObjects: {
          ...Object.fromEntries(objects.map((item) => [item.name, item.present])),
          'subscription_events.provider': providerColumn?.present ?? false,
        },
        s7FixtureAggregateCount: fixtures?.count ?? 0,
      }
    })
    console.log(JSON.stringify(report, null, 2))
  } finally {
    await sql.end()
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})

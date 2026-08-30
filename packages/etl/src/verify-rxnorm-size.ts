import { sql } from 'drizzle-orm'
import { pathToFileURL } from 'node:url'

export const DATABASE_WARNING_BYTES = 900 * 1024 * 1024
export const DATABASE_HARD_LIMIT_BYTES = 1024 * 1024 * 1024

export type ClinicalDatabaseFootprint = {
  databaseBytes: number
  mappingTableBytes: number
  mappingIndexBytes: number
  warning: boolean
  withinHardLimit: boolean
}

function numeric(value: unknown): number {
  const parsed = Number(value ?? 0)
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Geçersiz DB boyutu: ${value}`)
  return parsed
}

export function evaluateClinicalDatabaseFootprint(row: Record<string, unknown>) {
  const databaseBytes = numeric(row.database_bytes)
  const mappingTableBytes = numeric(row.mapping_table_bytes)
  const mappingIndexBytes = numeric(row.mapping_index_bytes)
  return {
    databaseBytes,
    mappingTableBytes,
    mappingIndexBytes,
    warning: databaseBytes >= DATABASE_WARNING_BYTES,
    withinHardLimit: databaseBytes <= DATABASE_HARD_LIMIT_BYTES,
  } satisfies ClinicalDatabaseFootprint
}

export async function readClinicalDatabaseFootprint(): Promise<ClinicalDatabaseFootprint> {
  const { db } = await import('@ogun/db')
  try {
    const rows = await db.execute(sql`
      select
        pg_database_size(current_database())::bigint as database_bytes,
        coalesce(
          pg_table_size(to_regclass('public.medication_substance_mappings')),
          0
        )::bigint as mapping_table_bytes,
        coalesce(
          pg_indexes_size(to_regclass('public.medication_substance_mappings')),
          0
        )::bigint as mapping_index_bytes
    `)
    return evaluateClinicalDatabaseFootprint((rows as Array<Record<string, unknown>>)[0] ?? {})
  } finally {
    await db.$client.end()
  }
}

function mib(bytes: number) {
  return Math.round((bytes / 1024 / 1024) * 100) / 100
}

async function main() {
  const footprint = await readClinicalDatabaseFootprint()
  console.log(
    JSON.stringify(
      {
        databaseBytes: footprint.databaseBytes,
        databaseMiB: mib(footprint.databaseBytes),
        mappingTableBytes: footprint.mappingTableBytes,
        mappingTableMiB: mib(footprint.mappingTableBytes),
        mappingIndexBytes: footprint.mappingIndexBytes,
        mappingIndexesMiB: mib(footprint.mappingIndexBytes),
        warningThresholdMiB: 900,
        hardLimitMiB: 1024,
        status: footprint.withinHardLimit ? (footprint.warning ? 'WARN' : 'PASS') : 'FAIL',
      },
      null,
      2,
    ),
  )
  if (!footprint.withinHardLimit) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main()
}

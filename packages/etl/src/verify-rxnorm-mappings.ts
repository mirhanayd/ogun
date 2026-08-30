import { pathToFileURL } from 'node:url'
import { sql } from 'drizzle-orm'
import { DATABASE_HARD_LIMIT_BYTES, evaluateClinicalDatabaseFootprint } from './verify-rxnorm-size'

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0)
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Geçersiz sayım: ${value}`)
  return parsed
}

export async function verifyRxNormMappings() {
  const { db } = await import('@ogun/db')
  try {
    const [summaryRows, duplicateRows, orphanRows, invalidRows, sizeRows] = await Promise.all([
      db.execute(sql`
        select
          (select count(*) from medication_substances)::bigint as total_substances,
          count(distinct medication_substance_id)::bigint as substances_with_any_candidate,
          count(*) filter (where mapping_status = 'candidate')::bigint as candidate_only,
          count(*) filter (where mapping_status = 'reviewed')::bigint as reviewed,
          count(*) filter (where mapping_status = 'verified')::bigint as verified,
          count(*) filter (where mapping_status = 'ambiguous')::bigint as ambiguous,
          count(*) filter (where mapping_status = 'unmapped')::bigint as unmapped,
          count(*) filter (where mapping_status = 'rejected')::bigint as rejected,
          count(*)::bigint as total_mapping_rows
        from medication_substance_mappings
        where system = 'RXNORM'
      `),
      db.execute(sql`
        select
          mapping.external_id as rxcui,
          count(distinct mapping.medication_substance_id)::bigint as substance_count,
          array_agg(distinct substance.name_tr order by substance.name_tr) as substance_names
        from medication_substance_mappings mapping
        join medication_substances substance on substance.id = mapping.medication_substance_id
        where mapping.system = 'RXNORM'
          and mapping.mapping_status not in ('rejected', 'unmapped')
        group by mapping.external_id
        having count(distinct mapping.medication_substance_id) > 1
        order by count(distinct mapping.medication_substance_id) desc, mapping.external_id
      `),
      db.execute(sql`
        select count(*)::bigint as orphan_count
        from medication_substance_mappings mapping
        left join medication_substances substance on substance.id = mapping.medication_substance_id
        where substance.id is null
      `),
      db.execute(sql`
        select count(*)::bigint as invalid_effective_count
        from medication_substance_mappings
        where mapping_status in ('reviewed', 'verified')
          and (reviewed_by is null or reviewed_at is null)
      `),
      db.execute(sql`
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
      `),
    ])

    const summary = (summaryRows as Array<Record<string, unknown>>)[0] ?? {}
    const totalSubstances = numberValue(summary.total_substances)
    const substancesWithAnyCandidate = numberValue(summary.substances_with_any_candidate)
    const orphanCount = numberValue((orphanRows as Array<Record<string, unknown>>)[0]?.orphan_count)
    const invalidEffectiveCount = numberValue(
      (invalidRows as Array<Record<string, unknown>>)[0]?.invalid_effective_count,
    )
    const footprint = evaluateClinicalDatabaseFootprint(
      (sizeRows as Array<Record<string, unknown>>)[0] ?? {},
    )
    const suspiciousExternalMappings = (duplicateRows as Array<Record<string, unknown>>).map(
      (row) => ({
        rxcui: String(row.rxcui),
        substanceCount: numberValue(row.substance_count),
        substanceNames: row.substance_names,
      }),
    )

    return {
      totalOgunSubstances: totalSubstances,
      substancesWithAnyRxNormCandidate: substancesWithAnyCandidate,
      substancesWithoutAnyRxNormCandidate: totalSubstances - substancesWithAnyCandidate,
      totalMappingRows: numberValue(summary.total_mapping_rows),
      candidateOnly: numberValue(summary.candidate_only),
      reviewed: numberValue(summary.reviewed),
      verified: numberValue(summary.verified),
      ambiguous: numberValue(summary.ambiguous),
      unmapped: numberValue(summary.unmapped),
      rejected: numberValue(summary.rejected),
      orphanMedicationSubstanceReferences: orphanCount,
      invalidEffectiveMappings: invalidEffectiveCount,
      duplicateExternalMappingGroups: suspiciousExternalMappings.length,
      duplicateExternalMappingSamples: suspiciousExternalMappings.slice(0, 20),
      databaseBytes: footprint.databaseBytes,
      mappingTableBytes: footprint.mappingTableBytes,
      mappingIndexBytes: footprint.mappingIndexBytes,
      databaseHardLimitBytes: DATABASE_HARD_LIMIT_BYTES,
      databaseWithinHardLimit: footprint.withinHardLimit,
      status:
        orphanCount === 0 && invalidEffectiveCount === 0 && footprint.withinHardLimit
          ? 'PASS'
          : 'FAIL',
    }
  } finally {
    await db.$client.end()
  }
}

async function main() {
  const result = await verifyRxNormMappings()
  console.log(JSON.stringify(result, null, 2))
  if (result.status !== 'PASS') process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main()
}

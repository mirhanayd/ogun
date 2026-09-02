import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { sql } from 'drizzle-orm'
import { getPublishedInteractionsForMedicationSubstances } from '@ogun/db/queries'
import { importApprovedClinicalInteractions } from './importers/clinical-interactions'
import { DATABASE_HARD_LIMIT_BYTES, DATABASE_WARNING_BYTES } from './verify-rxnorm-size'

function numeric(value: unknown) {
  const parsed = Number(value ?? 0)
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Invalid numeric DB value: ${value}`)
  return parsed
}

export function assertReviewedClinicalMigrationSql(contents: string) {
  if (/^\s*(drop|truncate|delete)\b/im.test(contents)) {
    throw new Error('Reviewed clinical migration contains destructive SQL')
  }
  for (const table of [
    'clinical_target_concepts',
    'clinical_interactions',
    'clinical_interaction_evidence',
  ]) {
    if (!contents.includes(`CREATE TABLE "${table}"`)) {
      throw new Error(`Reviewed clinical migration is missing ${table}`)
    }
  }
  if (!contents.includes('num_nonnulls'))
    throw new Error('Condition/medication subject XOR is missing')
  if (!contents.includes('clinical_interactions_publish_check')) {
    throw new Error('Published/approved DB guard is missing')
  }
}

export async function verifyReviewedClinicalInteractionPipeline(options: {
  baseDir: string
  migrationPath: string
}) {
  assertReviewedClinicalMigrationSql(readFileSync(options.migrationPath, 'utf8'))
  const dryRun = await importApprovedClinicalInteractions({
    baseDir: options.baseDir,
    dryRun: true,
  })
  const run1 = await importApprovedClinicalInteractions({ baseDir: options.baseDir })
  const run2 = await importApprovedClinicalInteractions({ baseDir: options.baseDir })
  if (run2.inserted !== 0 || run2.updated !== 0) {
    throw new Error('Second approved interaction import produced semantic changes')
  }

  const { db } = await import('@ogun/db')
  try {
    const [countRows, sizeRows, relationRows, constraintRows, subjectRows, smokeSubjectRows] =
      await Promise.all([
        db.execute(sql`
        select
          count(*) filter (where status = 'published')::bigint as published,
          count(*) filter (where status = 'draft')::bigint as draft,
          count(*) filter (where review_status = 'approved')::bigint as approved,
          count(*) filter (
            where status = 'published' and review_status = 'approved'
          )::bigint as published_approved,
          count(*) filter (
            where status = 'published' and review_status <> 'approved'
          )::bigint as unsafe_published,
          (select count(*) from clinical_interaction_evidence)::bigint as evidence_rows,
          (select count(*) from clinical_interaction_evidence where evidence_summary is not null)::bigint
            as evidence_summaries
        from clinical_interactions
      `),
        db.execute(sql`select pg_database_size(current_database())::bigint as database_bytes`),
        db.execute(sql`
        select
          relname,
          pg_table_size(oid)::bigint as table_bytes,
          pg_indexes_size(oid)::bigint as index_bytes
        from pg_class
        where oid in (
          to_regclass('public.clinical_target_concepts'),
          to_regclass('public.clinical_interactions'),
          to_regclass('public.clinical_interaction_evidence')
        )
        order by relname
      `),
        db.execute(sql`
        select conname
        from pg_constraint
        where conrelid = to_regclass('public.clinical_interactions')
        order by conname
      `),
        db.execute(sql`
        select distinct medication_substance_id
        from clinical_interactions
        where status = 'published' and review_status = 'approved'
          and medication_substance_id is not null
        order by medication_substance_id
      `),
        db.execute(sql`
        select medication_substance_id
        from medication_substance_mappings
        where system = 'RXNORM' and mapping_status = 'verified'
        order by medication_substance_id
        limit 1
      `),
      ])
    const counts = (countRows as Array<Record<string, unknown>>)[0] ?? {}
    const databaseBytes = numeric((sizeRows as Array<Record<string, unknown>>)[0]?.database_bytes)
    const subjectIds = (subjectRows as Array<Record<string, unknown>>).map((row) =>
      String(row.medication_substance_id),
    )
    const smokeSubject = (smokeSubjectRows as Array<Record<string, unknown>>)[0]
    const queryIds = subjectIds.length
      ? subjectIds
      : smokeSubject
        ? [String(smokeSubject.medication_substance_id)]
        : []
    if (queryIds.length === 0)
      throw new Error('No verified medication subject for query smoke test')
    const visible = await getPublishedInteractionsForMedicationSubstances(db, queryIds)
    const published = numeric(counts.published)
    const approved = numeric(counts.approved)
    const evidenceRows = numeric(counts.evidence_rows)
    const constraintNames = new Set(
      (constraintRows as Array<Record<string, unknown>>).map((row) => String(row.conname)),
    )
    if (numeric(counts.unsafe_published) !== 0) throw new Error('Unsafe published DB rows found')
    if (visible.length !== numeric(counts.published_approved)) {
      throw new Error('Production query count differs from published+approved DB count')
    }
    if (numeric(counts.evidence_summaries) !== 0) {
      throw new Error('Raw/generated evidence text entered production DB')
    }
    if (evidenceRows > 0) {
      const missingEvidence = visible.some((interaction) => interaction.evidence.length === 0)
      if (missingEvidence) throw new Error('Published interaction has no compact provenance')
    }
    if (!constraintNames.has('clinical_interactions_subject_check')) {
      throw new Error('Condition-capable subject XOR constraint was not applied')
    }
    if (!constraintNames.has('clinical_interactions_publish_check')) {
      throw new Error('Published approval constraint was not applied')
    }
    if (databaseBytes >= DATABASE_WARNING_BYTES)
      throw new Error('Database reached 900 MiB warning limit')
    if (databaseBytes >= DATABASE_HARD_LIMIT_BYTES)
      throw new Error('Database reached 1 GiB hard limit')

    return {
      migration: { path: options.migrationPath, drop: 'none', applied: true },
      decisions: {
        fileFound: dryRun.decisionFileFound,
        approved: dryRun.approved,
        rejected: dryRun.rejected,
        deferred: dryRun.deferred,
        needsMoreEvidence: dryRun.needsMoreEvidence,
      },
      import: { dryRun, run1, run2, semanticChangesRun2: run2.inserted + run2.updated },
      production: {
        published,
        draft: numeric(counts.draft),
        approved,
        evidenceRows,
        visibleByProductionQuery: visible.length,
        rawEvidenceStored: false,
      },
      database: {
        bytes: databaseBytes,
        mebibytes: Math.round((databaseBytes / 1024 / 1024) * 100) / 100,
        warning900MiB: false,
        hardLimit1GiB: true,
        relations: relationRows,
      },
      schema: {
        conditionSubjectSupported: true,
        constraintNames: [...constraintNames],
      },
    }
  } finally {
    await db.$client.end()
  }
}

async function main() {
  const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const baseDir = path.resolve(packageDir, 'data/clinical/openfda')
  const migrationPath = path.resolve(packageDir, '../db/drizzle/0028_brown_major_mapleleaf.sql')
  console.log(
    JSON.stringify(
      await verifyReviewedClinicalInteractionPipeline({ baseDir, migrationPath }),
      null,
      2,
    ),
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}

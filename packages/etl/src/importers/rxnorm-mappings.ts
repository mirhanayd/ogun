import path from 'node:path'
import { and, eq, inArray, sql } from 'drizzle-orm'
import {
  medicationSubstanceAliases,
  medicationSubstanceMappings,
  medicationSubstances,
} from '@ogun/db/schema'
import { registerClinicalTerminologySources } from '../clinical-source-registry'
import {
  DEFAULT_RXNORM_PACKAGE_DIR,
  buildSubstanceResolver,
  loadWorklist,
  prepareMappings,
  selectDeterministicCandidates,
  verifyRxNormPackage,
  type CandidateMapping,
} from '../rxnorm-mapping'
import { buildReviewExports, writeReviewExports } from '../rxnorm-review'

const BATCH_SIZE = 500

function packageDirFromArgs() {
  const value = process.argv.slice(2).find((argument) => argument.startsWith('--dir='))
  return value ? path.resolve(value.slice('--dir='.length)) : DEFAULT_RXNORM_PACKAGE_DIR
}

function sameCandidate(
  existing: {
    matchMethod: string
    confidence: number | null
    matchedTerm: string | null
    externalTermType: string | null
    sourceVersion: string
  },
  candidate: CandidateMapping,
) {
  return (
    existing.matchMethod === candidate.matchMethod &&
    existing.confidence === candidate.confidence &&
    existing.matchedTerm === candidate.matchedTerm &&
    existing.externalTermType === candidate.externalTermType &&
    existing.sourceVersion === candidate.sourceVersion
  )
}

async function main() {
  const packageDir = packageDirFromArgs()
  const dryRun = process.argv.includes('--dry-run')
  verifyRxNormPackage(packageDir)

  const { db } = await import('@ogun/db')
  if (!dryRun) await registerClinicalTerminologySources(db)
  const [substances, aliases] = await Promise.all([
    db
      .select({
        id: medicationSubstances.id,
        nameTr: medicationSubstances.nameTr,
        normalizedName: medicationSubstances.normalizedName,
        searchText: medicationSubstances.searchText,
        isCombination: medicationSubstances.isCombination,
      })
      .from(medicationSubstances),
    db
      .select({
        medicationSubstanceId: medicationSubstanceAliases.medicationSubstanceId,
        alias: medicationSubstanceAliases.alias,
        searchNormalized: medicationSubstanceAliases.searchNormalized,
      })
      .from(medicationSubstanceAliases),
  ])

  const prepared = prepareMappings(
    loadWorklist(packageDir),
    buildSubstanceResolver(substances, aliases),
  )
  const reviewCounts = writeReviewExports(
    await buildReviewExports(prepared, substances, packageDir),
    path.join(packageDir, 'review'),
  )
  const candidates = selectDeterministicCandidates(prepared)
  const existing = await db
    .select()
    .from(medicationSubstanceMappings)
    .where(
      and(
        eq(medicationSubstanceMappings.system, 'RXNORM'),
        inArray(medicationSubstanceMappings.medicationSubstanceId, [
          ...new Set(candidates.map((candidate) => candidate.medicationSubstanceId)),
        ]),
      ),
    )
  const existingByKey = new Map(
    existing.map((row) => [`${row.medicationSubstanceId}\0${row.externalId}`, row]),
  )

  let inserted = 0
  let updated = 0
  let unchanged = 0
  let protectedByReview = 0
  const pending = candidates.filter((candidate) => {
    const row = existingByKey.get(`${candidate.medicationSubstanceId}\0${candidate.externalId}`)
    if (!row) {
      inserted += 1
      return true
    }
    if (row.mappingStatus !== 'candidate') {
      protectedByReview += 1
      return false
    }
    if (sameCandidate(row, candidate)) {
      unchanged += 1
      return false
    }
    updated += 1
    return true
  })

  if (!dryRun) {
    for (let offset = 0; offset < pending.length; offset += BATCH_SIZE) {
      const batch = pending.slice(offset, offset + BATCH_SIZE)
      await db
        .insert(medicationSubstanceMappings)
        .values(
          batch.map(
            ({
              sourcePhrase: _,
              reviewTier: __,
              joinMethod: ___,
              isCombinationHint: ____,
              ...row
            }) => row,
          ),
        )
        .onConflictDoUpdate({
          target: [
            medicationSubstanceMappings.medicationSubstanceId,
            medicationSubstanceMappings.system,
            medicationSubstanceMappings.externalId,
          ],
          set: {
            matchMethod: sql`excluded.match_method`,
            confidence: sql`excluded.confidence`,
            matchedTerm: sql`excluded.matched_term`,
            externalTermType: sql`excluded.external_term_type`,
            sourceVersion: sql`excluded.source_version`,
            updatedAt: new Date(),
          },
          setWhere: eq(medicationSubstanceMappings.mappingStatus, 'candidate'),
        })
    }
  }

  const result = {
    mode: dryRun ? 'dry-run' : 'import',
    packageDir,
    worklistRows: prepared.length,
    canonicalResolved: prepared.filter((item) => item.resolution.kind === 'resolved').length,
    ambiguousCanonicalJoin: prepared.filter((item) => item.resolution.kind === 'ambiguous').length,
    unmappedCanonicalJoin: prepared.filter((item) => item.resolution.kind === 'unmapped').length,
    packageUnmapped: prepared.filter((item) => item.row.review_tier === 'unmapped').length,
    reviewExports: reviewCounts,
    distinctCandidates: candidates.length,
    inserted: dryRun ? 0 : inserted,
    updated: dryRun ? 0 : updated,
    unchanged,
    protectedByReview,
    wouldInsert: dryRun ? inserted : undefined,
    wouldUpdate: dryRun ? updated : undefined,
  }
  console.log(JSON.stringify(result, null, 2))
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error)
    process.exit(1)
  },
)

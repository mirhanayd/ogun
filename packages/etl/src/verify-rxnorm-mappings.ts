import { createReadStream } from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { pathToFileURL } from 'node:url'
import { createGunzip } from 'node:zlib'
import { and, eq, sql } from 'drizzle-orm'
import {
  medicationSubstanceAliases,
  medicationSubstanceMappings,
  medicationSubstances,
} from '@ogun/db/schema'
import {
  DEFAULT_RXNORM_PACKAGE_DIR,
  buildSubstanceResolver,
  loadWorklist,
  prepareMappings,
  selectDeterministicCandidates,
  verifyRxNormPackage,
} from './rxnorm-mapping'
import {
  DEFAULT_RXNORM_REVIEW_DECISIONS_PATH,
  applyHumanVerificationDecisions,
  loadRxNormReviewDecisions,
  reviewDecisionKey,
} from './rxnorm-review-decisions'
import { summarizeVerificationReport, writeRxNormVerificationReviewExports } from './rxnorm-review'
import { classifyRxNormMappings } from './rxnorm-verification'
import {
  DETERMINISTIC_VERIFICATION_METHOD,
  HUMAN_VERIFICATION_METHOD,
  RXNORM_VERIFICATION_VERSION,
  type HumanReviewDecision,
  type VerificationClassification,
} from './rxnorm-verification-types'
import {
  DEFAULT_VERIFIED_RXNORM_EXPORT_PATH,
  writeVerifiedRxNormExport,
} from './rxnorm-verified-export'
import {
  DATABASE_HARD_LIMIT_BYTES,
  DATABASE_WARNING_BYTES,
  evaluateClinicalDatabaseFootprint,
} from './verify-rxnorm-size'

type ExistingMapping = {
  id: string
  medicationSubstanceId: string
  rxcui: string
  mappingStatus: string
  matchMethod: string
  reviewedBy: string | null
  reviewedAt: Date | null
  verificationMethod: string | null
  verificationReason: string | null
  verificationVersion: string | null
}

export type PlannedVerificationMutation = {
  mappingId: string
  medicationSubstanceId: string
  rxcui: string
  mappingStatus: 'verified' | 'rejected' | 'ambiguous'
  reviewedBy: string
  reviewedAt: Date
  verificationMethod: string | null
  verificationReason: string | null
  verificationVersion: string | null
}

function dateValue(value: Date | null) {
  return value?.valueOf() ?? null
}

function sameSemanticState(existing: ExistingMapping, planned: PlannedVerificationMutation) {
  return (
    existing.mappingStatus === planned.mappingStatus &&
    existing.reviewedBy === planned.reviewedBy &&
    dateValue(existing.reviewedAt) === dateValue(planned.reviewedAt) &&
    existing.verificationMethod === planned.verificationMethod &&
    existing.verificationReason === planned.verificationReason &&
    existing.verificationVersion === planned.verificationVersion
  )
}

export function planRxNormVerificationMutations(
  classifications: VerificationClassification[],
  humanDecisions: HumanReviewDecision[],
  existingMappings: ExistingMapping[],
  deterministicTimestamp: Date,
) {
  const existingByKey = new Map(
    existingMappings.map((mapping) => [
      reviewDecisionKey(mapping.medicationSubstanceId, mapping.rxcui),
      mapping,
    ]),
  )
  const humanByKey = new Map(
    humanDecisions.map((decision) => [
      reviewDecisionKey(decision.medicationSubstanceId, decision.rxcui),
      decision,
    ]),
  )
  const targets = new Map<string, Omit<PlannedVerificationMutation, 'mappingId'>>()

  for (const item of classifications) {
    if (
      item.tier !== 'VERIFIED_EXACT' ||
      item.verificationMethod !== DETERMINISTIC_VERIFICATION_METHOD ||
      !item.medicationSubstanceId ||
      humanByKey.has(reviewDecisionKey(item.medicationSubstanceId, item.rxcui))
    ) {
      continue
    }
    const key = reviewDecisionKey(item.medicationSubstanceId, item.rxcui)
    const current = existingByKey.get(key)
    const firstVerifiedAt =
      current?.mappingStatus === 'verified' &&
      current.verificationMethod === DETERMINISTIC_VERIFICATION_METHOD &&
      current.reviewedAt
        ? current.reviewedAt
        : deterministicTimestamp
    targets.set(key, {
      medicationSubstanceId: item.medicationSubstanceId,
      rxcui: item.rxcui,
      mappingStatus: 'verified',
      reviewedBy: 'system:ogun-rxnorm-verifier',
      reviewedAt: firstVerifiedAt,
      verificationMethod: DETERMINISTIC_VERIFICATION_METHOD,
      verificationReason: item.reason,
      verificationVersion: RXNORM_VERIFICATION_VERSION,
    })
  }

  for (const decision of humanDecisions) {
    if (decision.decision === 'defer') continue
    const key = reviewDecisionKey(decision.medicationSubstanceId, decision.rxcui)
    targets.set(key, {
      medicationSubstanceId: decision.medicationSubstanceId,
      rxcui: decision.rxcui,
      mappingStatus:
        decision.decision === 'verify'
          ? 'verified'
          : decision.decision === 'reject'
            ? 'rejected'
            : 'ambiguous',
      reviewedBy: decision.reviewer,
      reviewedAt: decision.reviewedAt,
      verificationMethod: decision.decision === 'verify' ? HUMAN_VERIFICATION_METHOD : null,
      verificationReason: decision.decision === 'verify' ? 'human_review_approved' : null,
      verificationVersion: decision.decision === 'verify' ? RXNORM_VERIFICATION_VERSION : null,
    })
  }

  const mutations: PlannedVerificationMutation[] = []
  let unchanged = 0
  for (const [key, target] of targets) {
    const existing = existingByKey.get(key)
    if (!existing)
      throw new Error(`Candidate set dışında DB mutation yasak: ${key.replace('\0', '/')}`)
    const planned = { ...target, mappingId: existing.id }
    if (sameSemanticState(existing, planned)) unchanged += 1
    else mutations.push(planned)
  }
  return { mutations, unchanged, targets: targets.size }
}

async function loadKnownRxCuis(packageDir: string) {
  const known = new Set<string>()
  const input = createReadStream(path.join(packageDir, 'rxnorm_ingredient_concepts.jsonl.gz')).pipe(
    createGunzip(),
  )
  const lines = readline.createInterface({ input, crlfDelay: Infinity })
  for await (const line of lines) {
    if (!line.trim()) continue
    const concept = JSON.parse(line) as { rxcui?: unknown; tty?: unknown }
    if (typeof concept.rxcui !== 'string' || !['IN', 'PIN', 'MIN'].includes(String(concept.tty))) {
      throw new Error('RxNorm ingredient concept kaydı geçersiz')
    }
    known.add(concept.rxcui)
  }
  return known
}

function argumentValue(prefix: string) {
  return process.argv
    .slice(2)
    .find((argument) => argument.startsWith(prefix))
    ?.slice(prefix.length)
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0)
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Geçersiz sayım: ${value}`)
  return parsed
}

async function importDb() {
  return import('@ogun/db')
}

async function hasVerificationMigration(db: Awaited<ReturnType<typeof importDb>>['db']) {
  const rows = await db.execute(sql`
    select count(*)::int as column_count
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'medication_substance_mappings'
      and column_name in ('verification_method', 'verification_reason', 'verification_version')
  `)
  return numberValue((rows as Array<Record<string, unknown>>)[0]?.column_count) === 3
}

async function readExistingMappings(
  db: Awaited<ReturnType<typeof importDb>>['db'],
  provenanceColumnsExist: boolean,
): Promise<ExistingMapping[]> {
  const rows = provenanceColumnsExist
    ? await db.execute(sql`
        select id, medication_substance_id, external_id, mapping_status, match_method,
          reviewed_by, reviewed_at, verification_method, verification_reason, verification_version
        from medication_substance_mappings where system = 'RXNORM'
      `)
    : await db.execute(sql`
        select id, medication_substance_id, external_id, mapping_status, match_method,
          reviewed_by, reviewed_at, null::text as verification_method,
          null::text as verification_reason, null::text as verification_version
        from medication_substance_mappings where system = 'RXNORM'
      `)
  return (rows as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    medicationSubstanceId: String(row.medication_substance_id),
    rxcui: String(row.external_id),
    mappingStatus: String(row.mapping_status),
    matchMethod: String(row.match_method),
    reviewedBy: row.reviewed_by === null ? null : String(row.reviewed_by),
    reviewedAt: row.reviewed_at ? new Date(String(row.reviewed_at)) : null,
    verificationMethod: row.verification_method === null ? null : String(row.verification_method),
    verificationReason: row.verification_reason === null ? null : String(row.verification_reason),
    verificationVersion:
      row.verification_version === null ? null : String(row.verification_version),
  }))
}

async function readFootprint(db: Awaited<ReturnType<typeof importDb>>['db']) {
  const rows = await db.execute(sql`
    select pg_database_size(current_database())::bigint as database_bytes,
      coalesce(pg_table_size(to_regclass('public.medication_substance_mappings')), 0)::bigint
        as mapping_table_bytes,
      coalesce(pg_indexes_size(to_regclass('public.medication_substance_mappings')), 0)::bigint
        as mapping_index_bytes
  `)
  return evaluateClinicalDatabaseFootprint((rows as Array<Record<string, unknown>>)[0] ?? {})
}

async function applyMutations(
  db: Awaited<ReturnType<typeof importDb>>['db'],
  mutations: PlannedVerificationMutation[],
) {
  if (mutations.length === 0) return 0
  return db.transaction(async (tx) => {
    let changed = 0
    for (const mutation of mutations) {
      const updated = await tx
        .update(medicationSubstanceMappings)
        .set({
          mappingStatus: mutation.mappingStatus,
          reviewedBy: mutation.reviewedBy,
          reviewedAt: mutation.reviewedAt,
          verificationMethod: mutation.verificationMethod,
          verificationReason: mutation.verificationReason,
          verificationVersion: mutation.verificationVersion,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(medicationSubstanceMappings.id, mutation.mappingId),
            eq(medicationSubstanceMappings.system, 'RXNORM'),
          ),
        )
        .returning({ id: medicationSubstanceMappings.id })
      if (updated.length !== 1)
        throw new Error(`RxNorm mutation hedefi kayıp: ${mutation.mappingId}`)
      changed += 1
    }
    return changed
  })
}

async function readIntegrity(db: Awaited<ReturnType<typeof importDb>>['db']) {
  const [summaryRows, invalidRows, rawTableRows] = await Promise.all([
    db.execute(sql`
      select count(*)::bigint as total_mapping_rows,
        count(distinct medication_substance_id)::bigint as substances_with_mapping,
        count(*) filter (where mapping_status = 'candidate')::bigint as candidate,
        count(*) filter (where mapping_status = 'verified')::bigint as verified,
        count(*) filter (where mapping_status = 'rejected')::bigint as rejected,
        count(*) filter (where mapping_status = 'ambiguous')::bigint as ambiguous,
        count(*) filter (where mapping_status = 'verified'
          and verification_method = 'deterministic_exact_v1')::bigint as deterministic_verified,
        count(*) filter (where mapping_status = 'verified'
          and verification_method = 'human_review')::bigint as human_verified
      from medication_substance_mappings where system = 'RXNORM'
    `),
    db.execute(sql`
      select
        (select count(*) from medication_substance_mappings mapping
          left join medication_substances substance on substance.id = mapping.medication_substance_id
          where substance.id is null)::bigint as orphan_count,
        (select count(*) from medication_substance_mappings
          where mapping_status = 'verified'
            and (verification_method is null or verification_reason is null
              or verification_version is null))::bigint as missing_provenance,
        (select count(*) from medication_substance_mappings
          where mapping_status = 'verified' and match_method in ('fuzzy', 'atc_bridge', 'token_exact'))
          ::bigint as forbidden_verified_methods,
        (select count(*) from (
          select medication_substance_id from medication_substance_mappings
          where mapping_status = 'verified' group by medication_substance_id
          having count(distinct external_id) > 1
        ) conflicts)::bigint as verified_multiple_rxcui,
        (select count(*) from (
          select external_id from medication_substance_mappings
          where mapping_status = 'verified' group by external_id
          having count(distinct medication_substance_id) > 1
        ) conflicts)::bigint as verified_shared_rxcui
    `),
    db.execute(sql`
      select count(*)::bigint as raw_table_count from information_schema.tables
      where table_schema = 'public' and (
        table_name ilike '%rxnorm%' or table_name ilike '%titck%'
        or table_name ilike '%worklist%' or table_name ilike '%candidate_json%'
      )
    `),
  ])
  const summary = (summaryRows as Array<Record<string, unknown>>)[0] ?? {}
  const invalid = (invalidRows as Array<Record<string, unknown>>)[0] ?? {}
  const raw = (rawTableRows as Array<Record<string, unknown>>)[0] ?? {}
  const result = {
    totalMappingRows: numberValue(summary.total_mapping_rows),
    substancesWithMapping: numberValue(summary.substances_with_mapping),
    candidate: numberValue(summary.candidate),
    verified: numberValue(summary.verified),
    rejected: numberValue(summary.rejected),
    ambiguous: numberValue(summary.ambiguous),
    deterministicVerified: numberValue(summary.deterministic_verified),
    humanVerified: numberValue(summary.human_verified),
    orphanCount: numberValue(invalid.orphan_count),
    missingProvenance: numberValue(invalid.missing_provenance),
    forbiddenVerifiedMethods: numberValue(invalid.forbidden_verified_methods),
    verifiedMultipleRxCui: numberValue(invalid.verified_multiple_rxcui),
    verifiedSharedRxCui: numberValue(invalid.verified_shared_rxcui),
    rawRxNormTables: numberValue(raw.raw_table_count),
  }
  if (
    result.orphanCount > 0 ||
    result.missingProvenance > 0 ||
    result.forbiddenVerifiedMethods > 0 ||
    result.verifiedMultipleRxCui > 0 ||
    result.verifiedSharedRxCui > 0 ||
    result.rawRxNormTables > 0
  ) {
    throw new Error(`RxNorm DB integrity failure: ${JSON.stringify(result)}`)
  }
  return result
}

function representativeSamples(classifications: VerificationClassification[]) {
  const pick = (predicate: (item: VerificationClassification) => boolean) =>
    classifications.find(predicate) ?? null
  return {
    inExact: pick((item) => item.tier === 'VERIFIED_EXACT' && item.tty === 'IN'),
    pinExact: pick((item) => item.tier === 'VERIFIED_EXACT' && item.tty === 'PIN'),
    minExact: pick((item) => item.tier === 'VERIFIED_EXACT' && item.tty === 'MIN'),
    normalizedDeferred: pick((item) => item.reason === 'unsafe_normalization'),
    atcDeferred: pick((item) => item.reason === 'atc_requires_review'),
    fuzzyDeferred: pick((item) => item.reason === 'fuzzy_requires_review'),
    multipleRxCuiDeferred: pick((item) => item.reason === 'multiple_rxcui_review'),
    sharedRxCuiDeferred: pick((item) => item.reason === 'shared_rxcui_review'),
    unmapped: pick((item) => item.tier === 'UNMAPPED'),
  }
}

export async function runRxNormVerification(mode: 'dry-run' | 'apply') {
  const packageDir = path.resolve(argumentValue('--dir=') ?? DEFAULT_RXNORM_PACKAGE_DIR)
  const decisionsPath = path.resolve(
    argumentValue('--decisions=') ?? DEFAULT_RXNORM_REVIEW_DECISIONS_PATH,
  )
  verifyRxNormPackage(packageDir)
  const { db } = await importDb()
  try {
    const provenanceColumnsExist = await hasVerificationMigration(db)
    if (mode === 'apply' && !provenanceColumnsExist) {
      throw new Error('RxNorm provenance migration uygulanmadan --apply çalıştırılamaz')
    }
    const footprintBefore = await readFootprint(db)
    if (footprintBefore.databaseBytes >= DATABASE_WARNING_BYTES) {
      throw new Error('DB 900 MiB warning eşiğinde; RxNorm verification apply durduruldu')
    }
    if (footprintBefore.databaseBytes > DATABASE_HARD_LIMIT_BYTES) {
      throw new Error('DB 1 GiB hard limit aşıldı')
    }

    const [substances, aliases, knownRxCuis, existingMappings] = await Promise.all([
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
      loadKnownRxCuis(packageDir),
      readExistingMappings(db, provenanceColumnsExist),
    ])
    const prepared = prepareMappings(
      loadWorklist(packageDir),
      buildSubstanceResolver(substances, aliases),
    )
    const candidates = selectDeterministicCandidates(prepared)
    const candidateKeys = new Set(
      candidates.map((candidate) =>
        reviewDecisionKey(candidate.medicationSubstanceId, candidate.externalId),
      ),
    )
    const humanDecisions = loadRxNormReviewDecisions(
      {
        knownSubstanceIds: new Set(substances.map((substance) => substance.id)),
        knownRxCuis,
        candidateKeys,
      },
      decisionsPath,
    )
    const strictReport = classifyRxNormMappings(prepared, substances)
    const classifications = applyHumanVerificationDecisions(
      strictReport.classifications,
      humanDecisions,
    )
    const report = { ...strictReport, classifications }
    const plan = planRxNormVerificationMutations(
      classifications,
      humanDecisions,
      existingMappings,
      new Date(),
    )

    const forbiddenAuto = classifications.filter(
      (item) =>
        item.verificationMethod === DETERMINISTIC_VERIFICATION_METHOD &&
        !['unique_lexical_exact', 'unique_safe_normalized_exact'].includes(item.reason),
    )
    const conflictedAuto = classifications.filter(
      (item) =>
        item.verificationMethod === DETERMINISTIC_VERIFICATION_METHOD &&
        ['multiple_rxcui_review', 'shared_rxcui_review'].includes(item.reason),
    )
    if (forbiddenAuto.length > 0 || conflictedAuto.length > 0) {
      throw new Error('Strict auto-verification invariant ihlali')
    }

    const reviewDir = path.resolve(packageDir, '..', 'review')
    const reviewExports = writeRxNormVerificationReviewExports(report, substances, reviewDir)
    const applied = mode === 'apply' ? await applyMutations(db, plan.mutations) : 0
    const footprintAfter = await readFootprint(db)
    let integrity = null
    let verifiedExport = null
    if (mode === 'apply') {
      integrity = await readIntegrity(db)
      const { getVerifiedRxNormSubstancesForExport } = await import('@ogun/db/queries')
      verifiedExport = writeVerifiedRxNormExport(
        await getVerifiedRxNormSubstancesForExport(db),
        DEFAULT_VERIFIED_RXNORM_EXPORT_PATH,
      )
    }

    return {
      mode,
      packageDir,
      decisionsPath,
      decisionsLoaded: humanDecisions.length,
      provenanceMigrationApplied: provenanceColumnsExist,
      canonicalCandidates: new Set(candidates.map((item) => item.medicationSubstanceId)).size,
      mappingCandidates: candidates.length,
      summary: summarizeVerificationReport(report),
      rawPhraseQueues: Object.fromEntries(
        ['high_confidence_review', 'atc_supported_review', 'manual_review', 'unmapped'].map(
          (tier) => [tier, prepared.filter((item) => item.row.review_tier === tier).length],
        ),
      ),
      reviewExports,
      plan: {
        targets: plan.targets,
        semanticChanges: plan.mutations.length,
        unchanged: plan.unchanged,
        applied,
      },
      footprintBefore,
      footprintAfter,
      integrity,
      verifiedExport,
      samples: representativeSamples(classifications),
    }
  } finally {
    await db.$client.end()
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const apply = process.argv.includes('--apply')
  if (dryRun === apply) throw new Error('Tam olarak bir mod seçin: --dry-run veya --apply')
  const result = await runRxNormVerification(dryRun ? 'dry-run' : 'apply')
  console.log(JSON.stringify(result, null, 2))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}

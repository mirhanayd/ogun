import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { and, eq, inArray } from 'drizzle-orm'
import { db as defaultDb, type Database } from '@ogun/db'
import {
  clinicalInteractionEvidence,
  clinicalInteractions,
  clinicalSources,
  clinicalTargetConcepts,
  medicationSubstanceMappings,
  nutrients,
} from '@ogun/db/schema'
import {
  loadClinicalReviewDecisions,
  validateClinicalReviewDecisions,
  type ValidatedClinicalReviewDecision,
} from '../clinical-review-decisions'
import { resolveApprovedTargetKey } from '../clinical-interaction-targets'
import { representativeEvidence } from '../clinical-review-pack'
import {
  OPENFDA_CANDIDATE_FILE,
  OPENFDA_EVIDENCE_FILE,
  OPENFDA_SUMMARY_FILE,
  type OpenFdaExtractionSummary,
} from '../openfda-review-export'
import type { OpenFdaCandidateEvidence, OpenFdaInteractionCandidate } from '../openfda-types'
import { loadVerifiedRxNormSeeds } from '../openfda-verified-filter'

export const OPENFDA_CLINICAL_SOURCE_ID = 'OPENFDA_DRUG_LABEL'

function stableId(prefix: string, ...values: string[]) {
  return `${prefix}_${createHash('sha256').update(values.join('\0')).digest('hex').slice(0, 24)}`
}

export function stableClinicalInteractionId(candidateId: string) {
  return stableId('cli', candidateId)
}

export function stableClinicalEvidenceId(
  interactionId: string,
  evidence: Pick<OpenFdaCandidateEvidence, 'splSetId' | 'recordHash'>,
) {
  return stableId(
    'cie',
    interactionId,
    OPENFDA_CLINICAL_SOURCE_ID,
    evidence.splSetId,
    evidence.recordHash,
  )
}

function readGzipJsonl<T>(filePath: string): T[] {
  return gunzipSync(readFileSync(filePath))
    .toString('utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T)
}

export type ClinicalInteractionImportInput = {
  baseDir: string
  decisionsPath?: string
  dryRun?: boolean
}

export type ClinicalInteractionImportResult = {
  decisionFileFound: boolean
  dryRun: boolean
  decisions: number
  approved: number
  rejected: number
  deferred: number
  needsMoreEvidence: number
  inserted: number
  updated: number
  unchanged: number
  evidenceInserted: number
  published: number
}

function emptyResult(dryRun: boolean): ClinicalInteractionImportResult {
  return {
    decisionFileFound: false,
    dryRun,
    decisions: 0,
    approved: 0,
    rejected: 0,
    deferred: 0,
    needsMoreEvidence: 0,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    evidenceInserted: 0,
    published: 0,
  }
}

type InteractionValues = typeof clinicalInteractions.$inferInsert
type EvidenceValues = typeof clinicalInteractionEvidence.$inferInsert

function sameDate(left: Date | string | null | undefined, right: Date | string | null | undefined) {
  if (left == null || right == null) return left == null && right == null
  return new Date(left).getTime() === new Date(right).getTime()
}

export function interactionSemanticsEqual(
  existing: typeof clinicalInteractions.$inferSelect,
  desired: InteractionValues,
) {
  return (
    existing.medicationSubstanceId === desired.medicationSubstanceId &&
    existing.conditionId === (desired.conditionId ?? null) &&
    existing.targetType === desired.targetType &&
    existing.nutrientId === (desired.nutrientId ?? null) &&
    existing.clinicalTargetConceptId === (desired.clinicalTargetConceptId ?? null) &&
    existing.action === desired.action &&
    existing.severity === desired.severity &&
    existing.evidenceStrength === desired.evidenceStrength &&
    existing.timingBeforeMinutes === (desired.timingBeforeMinutes ?? null) &&
    existing.timingAfterMinutes === (desired.timingAfterMinutes ?? null) &&
    existing.titleTr === (desired.titleTr ?? null) &&
    existing.clinicalEffectTr === (desired.clinicalEffectTr ?? null) &&
    existing.mechanismTr === (desired.mechanismTr ?? null) &&
    existing.recommendationTr === (desired.recommendationTr ?? null) &&
    existing.status === desired.status &&
    existing.reviewStatus === desired.reviewStatus &&
    existing.reviewedBy === desired.reviewedBy &&
    sameDate(existing.reviewedAt, desired.reviewedAt) &&
    existing.sourceCandidateSemanticHash === desired.sourceCandidateSemanticHash
  )
}

function decisionCounts(decisions: ValidatedClinicalReviewDecision[]) {
  return {
    approved: decisions.filter((item) => item.decision === 'approve').length,
    rejected: decisions.filter((item) => item.decision === 'reject').length,
    deferred: decisions.filter((item) => item.decision === 'defer').length,
    needsMoreEvidence: decisions.filter((item) => item.decision === 'needs_more_evidence').length,
  }
}

export function approvedClinicalReviewDecisions(decisions: ValidatedClinicalReviewDecision[]) {
  return decisions.filter((item) => item.decision === 'approve')
}

export function buildApprovedClinicalInteractionRecord(options: {
  approval: ValidatedClinicalReviewDecision
  candidateSemanticHash: string
  targetType: string
  nutrientId: string | null
  clinicalTargetConceptId: string | null
}): InteractionValues {
  const { approval } = options
  if (
    approval.decision !== 'approve' ||
    !approval.reviewer ||
    !approval.reviewedAt ||
    !approval.severity ||
    !approval.evidenceStrength ||
    !approval.approvedAction
  ) {
    throw new Error(
      `Only a validated human approval can build an interaction: ${approval.candidate.id}`,
    )
  }
  return {
    id: stableClinicalInteractionId(approval.candidate.id),
    medicationSubstanceId: approval.candidate.medicationSubstanceId,
    conditionId: null,
    targetType: options.targetType,
    nutrientId: options.nutrientId,
    clinicalTargetConceptId: options.clinicalTargetConceptId,
    action: approval.approvedAction,
    severity: approval.severity,
    evidenceStrength: approval.evidenceStrength,
    timingBeforeMinutes: approval.candidate.beforeMinutes,
    timingAfterMinutes: approval.candidate.afterMinutes,
    titleTr: approval.titleTr,
    clinicalEffectTr: approval.clinicalEffectTr,
    mechanismTr: approval.mechanismTr,
    recommendationTr: approval.recommendationTr,
    status: 'published',
    reviewStatus: 'approved',
    reviewedBy: approval.reviewer,
    reviewedAt: approval.reviewedAt,
    sourceCandidateId: approval.candidate.id,
    sourceCandidateSemanticHash: options.candidateSemanticHash,
    version: 1,
  }
}

export function buildClinicalInteractionEvidenceRecord(options: {
  interactionId: string
  evidence: OpenFdaCandidateEvidence
  evidenceStrength: string
}): EvidenceValues {
  const { evidence } = options
  const retrievedAt = new Date(evidence.retrievedAt)
  if (Number.isNaN(retrievedAt.getTime())) {
    throw new Error(`Invalid evidence retrieved_at: ${evidence.id}`)
  }
  if (evidence.sourceSystem !== 'openfda' || !evidence.splSetId || !evidence.recordHash) {
    throw new Error(`Invalid openFDA evidence provenance: ${evidence.id}`)
  }
  return {
    id: stableClinicalEvidenceId(options.interactionId, evidence),
    interactionId: options.interactionId,
    sourceId: OPENFDA_CLINICAL_SOURCE_ID,
    sourceDocumentId: evidence.splSetId,
    sourceVersion:
      [evidence.effectiveTime, evidence.labelVersion].filter(Boolean).join(':') || null,
    sourceSection: evidence.matchedSection,
    sourceLocator: `openfda:${evidence.splSetId}:${evidence.effectiveTime ?? ''}:${evidence.matchedSection}:${evidence.labelPartitionFile}`,
    // Full evidence text remains in the filesystem JSONL. Human-authored clinical
    // text belongs on the interaction; the compact provenance row stores no excerpt.
    evidenceSummary: null,
    sourceHash: evidence.recordHash,
    retrievedAt,
    evidenceStrength: options.evidenceStrength,
  }
}

export async function importApprovedClinicalInteractions(
  options: ClinicalInteractionImportInput,
  database: Database = defaultDb,
): Promise<ClinicalInteractionImportResult> {
  const dryRun = options.dryRun ?? false
  const decisionsPath = path.resolve(
    options.decisionsPath ??
      path.join(options.baseDir, 'review', 'openfda-clinical-review-decisions.csv'),
  )
  if (!existsSync(decisionsPath)) return emptyResult(dryRun)

  const extractedDir = path.join(options.baseDir, 'extracted')
  const candidates = readGzipJsonl<OpenFdaInteractionCandidate>(
    path.join(extractedDir, OPENFDA_CANDIDATE_FILE),
  )
  const evidence = readGzipJsonl<OpenFdaCandidateEvidence>(
    path.join(extractedDir, OPENFDA_EVIDENCE_FILE),
  )
  const summary = JSON.parse(
    readFileSync(path.join(extractedDir, OPENFDA_SUMMARY_FILE), 'utf8'),
  ) as OpenFdaExtractionSummary
  if (
    summary.partialCoverage ||
    summary.openfda.partitionCount !== summary.availablePartitions ||
    summary.openfda.expectedTotalRecords !== summary.openfda.parsedTotalRecords ||
    !summary.openfda.manifestSha256 ||
    !summary.labelExportDate
  ) {
    throw new Error('openFDA source provenance is incomplete or partial')
  }

  const verifiedSeeds = loadVerifiedRxNormSeeds()
  const decisions = validateClinicalReviewDecisions({
    rows: loadClinicalReviewDecisions(decisionsPath),
    candidates,
    evidence,
    candidateSemanticHash: summary.extraction.semanticHash,
    verifiedMedicationSubstanceIds: new Set(
      verifiedSeeds.map((item) => item.medicationSubstanceId),
    ),
  })
  const counts = decisionCounts(decisions)
  const approvals = approvedClinicalReviewDecisions(decisions)
  if (approvals.length === 0) {
    return {
      ...emptyResult(dryRun),
      decisionFileFound: true,
      decisions: decisions.length,
      ...counts,
    }
  }

  return database.transaction(async (tx) => {
    const [[source], verifiedMappings] = await Promise.all([
      tx
        .select({ id: clinicalSources.id })
        .from(clinicalSources)
        .where(eq(clinicalSources.id, OPENFDA_CLINICAL_SOURCE_ID))
        .limit(1),
      tx
        .select({
          medicationSubstanceId: medicationSubstanceMappings.medicationSubstanceId,
          rxcui: medicationSubstanceMappings.externalId,
        })
        .from(medicationSubstanceMappings)
        .where(
          and(
            eq(medicationSubstanceMappings.system, 'RXNORM'),
            eq(medicationSubstanceMappings.mappingStatus, 'verified'),
            inArray(
              medicationSubstanceMappings.medicationSubstanceId,
              approvals.map((item) => item.candidate.medicationSubstanceId),
            ),
          ),
        ),
    ])
    if (!source) throw new Error('OPENFDA_DRUG_LABEL clinical source is not registered')
    const verified = new Set(
      verifiedMappings.map((item) => `${item.medicationSubstanceId}\0${item.rxcui}`),
    )
    for (const approval of approvals) {
      if (
        !verified.has(`${approval.candidate.medicationSubstanceId}\0${approval.candidate.rxcui}`)
      ) {
        throw new Error(`Medication subject is not DB-verified: ${approval.candidate.id}`)
      }
    }

    const nutrientCodes = approvals
      .map((approval) => resolveApprovedTargetKey(approval.approvedTargetKey!))
      .filter(
        (item): item is NonNullable<typeof item> & { kind: 'nutrient' } =>
          item?.kind === 'nutrient',
      )
      .map((item) => item.nutrientCode)
    const nutrientRows = nutrientCodes.length
      ? await tx
          .select({ id: nutrients.id, code: nutrients.code })
          .from(nutrients)
          .where(inArray(nutrients.code, nutrientCodes))
      : []
    const nutrientByCode = new Map(nutrientRows.map((item) => [item.code, item.id]))

    const desiredInteractions: InteractionValues[] = []
    const selectedEvidence = new Map<string, OpenFdaCandidateEvidence>()
    for (const approval of approvals) {
      const target = resolveApprovedTargetKey(approval.approvedTargetKey!)
      if (!target) throw new Error(`Approved target became unresolved: ${approval.candidate.id}`)
      let nutrientId: string | null = null
      let clinicalTargetConceptId: string | null = null
      if (target.kind === 'nutrient') {
        nutrientId = nutrientByCode.get(target.nutrientCode) ?? null
        if (!nutrientId) throw new Error(`Nutrient does not exist in Ogun: ${target.nutrientCode}`)
      } else {
        clinicalTargetConceptId = target.clinicalTarget.id
        if (!dryRun) {
          await tx
            .insert(clinicalTargetConcepts)
            .values(target.clinicalTarget)
            .onConflictDoNothing({ target: clinicalTargetConcepts.id })
        }
      }
      const interactionId = stableClinicalInteractionId(approval.candidate.id)
      const bestEvidence = representativeEvidence(approval.evidence)
      if (!bestEvidence) throw new Error(`Candidate evidence missing: ${approval.candidate.id}`)
      if (
        bestEvidence.sourceSystem !== 'openfda' ||
        !bestEvidence.splSetId ||
        !bestEvidence.recordHash
      ) {
        throw new Error(`Invalid openFDA evidence provenance: ${approval.candidate.id}`)
      }
      selectedEvidence.set(interactionId, bestEvidence)
      desiredInteractions.push(
        buildApprovedClinicalInteractionRecord({
          approval,
          candidateSemanticHash: summary.extraction.semanticHash,
          targetType: target.targetType,
          nutrientId,
          clinicalTargetConceptId,
        }),
      )
    }

    const existingRows = await tx
      .select()
      .from(clinicalInteractions)
      .where(
        inArray(
          clinicalInteractions.sourceCandidateId,
          approvals.map((item) => item.candidate.id),
        ),
      )
    const existingByCandidate = new Map(existingRows.map((item) => [item.sourceCandidateId, item]))
    let inserted = 0
    let updated = 0
    let unchanged = 0
    let evidenceInserted = 0

    for (const desired of desiredInteractions) {
      const existing = existingByCandidate.get(desired.sourceCandidateId)
      if (!existing) {
        inserted += 1
        if (!dryRun) await tx.insert(clinicalInteractions).values(desired)
      } else if (interactionSemanticsEqual(existing, desired)) {
        unchanged += 1
      } else {
        updated += 1
        if (!dryRun) {
          await tx
            .update(clinicalInteractions)
            .set({
              ...desired,
              id: undefined,
              version: existing.version + 1,
              updatedAt: new Date(),
            })
            .where(eq(clinicalInteractions.id, existing.id))
        }
      }

      const best = selectedEvidence.get(desired.id)!
      const evidenceRecord = buildClinicalInteractionEvidenceRecord({
        interactionId: desired.id,
        evidence: best,
        evidenceStrength: desired.evidenceStrength,
      })
      const evidenceId = evidenceRecord.id
      const [existingEvidence] = await tx
        .select({ id: clinicalInteractionEvidence.id })
        .from(clinicalInteractionEvidence)
        .where(eq(clinicalInteractionEvidence.id, evidenceId))
        .limit(1)
      if (!existingEvidence) {
        evidenceInserted += 1
        if (!dryRun) {
          await tx.insert(clinicalInteractionEvidence).values(evidenceRecord)
        }
      }
    }

    return {
      decisionFileFound: true,
      dryRun,
      decisions: decisions.length,
      ...counts,
      inserted,
      updated,
      unchanged,
      evidenceInserted,
      published: approvals.length,
    }
  })
}

async function main() {
  const baseArgument = process.argv.slice(2).find((item) => item.startsWith('--dir='))
  const decisionArgument = process.argv.slice(2).find((item) => item.startsWith('--decisions='))
  const baseDir = path.resolve(
    baseArgument?.slice('--dir='.length) ??
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data/clinical/openfda'),
  )
  const result = await importApprovedClinicalInteractions({
    baseDir,
    decisionsPath: decisionArgument?.slice('--decisions='.length),
    dryRun: process.argv.includes('--dry-run'),
  })
  console.log(JSON.stringify(result, null, 2))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}

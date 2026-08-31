import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import Papa from 'papaparse'
import { DEFAULT_RXNORM_PACKAGE_DIR } from './rxnorm-mapping'
import type {
  HumanReviewDecision,
  HumanReviewDecisionValue,
  VerificationClassification,
} from './rxnorm-verification-types'
import {
  HUMAN_VERIFICATION_METHOD,
  RXNORM_VERIFICATION_VERSION,
} from './rxnorm-verification-types'

export const DEFAULT_RXNORM_REVIEW_DECISIONS_PATH = path.resolve(
  DEFAULT_RXNORM_PACKAGE_DIR,
  '..',
  'review',
  'rxnorm-review-decisions.csv',
)

type DecisionCsvRow = {
  medication_substance_id?: string
  rxnorm_rxcui?: string
  decision?: string
  reviewer?: string
  reviewed_at?: string
  note?: string
}

const DECISIONS = new Set<HumanReviewDecisionValue>([
  'verify',
  'reject',
  'ambiguous',
  'defer',
])

export type ReviewDecisionValidationContext = {
  knownSubstanceIds: ReadonlySet<string>
  knownRxCuis: ReadonlySet<string>
  candidateKeys: ReadonlySet<string>
}

export function reviewDecisionKey(medicationSubstanceId: string, rxcui: string) {
  return `${medicationSubstanceId}\0${rxcui}`
}

export function parseRxNormReviewDecisions(
  csv: string,
  context: ReviewDecisionValidationContext,
): HumanReviewDecision[] {
  const parsed = Papa.parse<DecisionCsvRow>(csv, { header: true, skipEmptyLines: true })
  if (parsed.errors.length > 0) {
    const first = parsed.errors[0]!
    throw new Error(`RxNorm review decision CSV parse hatası (${first.row ?? '?'}): ${first.message}`)
  }

  const decisions = new Map<string, HumanReviewDecision>()
  for (const [index, row] of parsed.data.entries()) {
    const line = index + 2
    const medicationSubstanceId = row.medication_substance_id?.trim() ?? ''
    const rxcui = row.rxnorm_rxcui?.trim() ?? ''
    const decision = row.decision?.trim().toLowerCase() ?? ''
    const reviewer = row.reviewer?.trim() ?? ''
    const reviewedAtText = row.reviewed_at?.trim() ?? ''
    const note = row.note?.trim() ?? ''

    if (!context.knownSubstanceIds.has(medicationSubstanceId)) {
      throw new Error(`RxNorm review satır ${line}: bilinmeyen medication_substance_id`)
    }
    if (!context.knownRxCuis.has(rxcui)) {
      throw new Error(`RxNorm review satır ${line}: bilinmeyen RxCUI ${rxcui || '(boş)'}`)
    }
    if (!DECISIONS.has(decision as HumanReviewDecisionValue)) {
      throw new Error(`RxNorm review satır ${line}: geçersiz decision ${decision || '(boş)'}`)
    }
    if (!reviewer) throw new Error(`RxNorm review satır ${line}: reviewer zorunlu`)
    const reviewedAt = new Date(reviewedAtText)
    if (!reviewedAtText || Number.isNaN(reviewedAt.valueOf())) {
      throw new Error(`RxNorm review satır ${line}: geçersiz reviewed_at`)
    }

    const key = reviewDecisionKey(medicationSubstanceId, rxcui)
    if (decision === 'verify' && !context.candidateKeys.has(key)) {
      throw new Error(`RxNorm review satır ${line}: candidate set dışında verify yasak`)
    }
    const next: HumanReviewDecision = {
      medicationSubstanceId,
      rxcui,
      decision: decision as HumanReviewDecisionValue,
      reviewer,
      reviewedAt,
      note,
    }
    const existing = decisions.get(key)
    if (
      existing &&
      (existing.decision !== next.decision ||
        existing.reviewer !== next.reviewer ||
        existing.reviewedAt.valueOf() !== next.reviewedAt.valueOf() ||
        existing.note !== next.note)
    ) {
      throw new Error(`RxNorm review satır ${line}: aynı mapping için conflicting decision`)
    }
    decisions.set(key, next)
  }

  return [...decisions.values()].sort(
    (a, b) =>
      a.medicationSubstanceId.localeCompare(b.medicationSubstanceId) ||
      a.rxcui.localeCompare(b.rxcui, 'en', { numeric: true }),
  )
}

export function loadRxNormReviewDecisions(
  context: ReviewDecisionValidationContext,
  decisionPath = DEFAULT_RXNORM_REVIEW_DECISIONS_PATH,
) {
  if (!existsSync(decisionPath)) return []
  return parseRxNormReviewDecisions(readFileSync(decisionPath, 'utf8'), context)
}

export function applyHumanVerificationDecisions(
  classifications: VerificationClassification[],
  decisions: HumanReviewDecision[],
) {
  const decisionByKey = new Map(
    decisions.map((decision) => [
      reviewDecisionKey(decision.medicationSubstanceId, decision.rxcui),
      decision,
    ]),
  )
  return classifications.map((item): VerificationClassification => {
    if (!item.medicationSubstanceId || !item.rxcui) return item
    const decision = decisionByKey.get(reviewDecisionKey(item.medicationSubstanceId, item.rxcui))
    if (!decision) return item
    if (decision.decision === 'verify') {
      return {
        ...item,
        tier: 'VERIFIED_EXACT',
        reason: 'human_review_approved',
        verificationMethod: HUMAN_VERIFICATION_METHOD,
        verificationVersion: RXNORM_VERIFICATION_VERSION,
      }
    }
    if (decision.decision === 'ambiguous') {
      return { ...item, tier: 'AMBIGUOUS', verificationMethod: null }
    }
    return { ...item, tier: 'REVIEW_MANUAL', verificationMethod: null }
  })
}

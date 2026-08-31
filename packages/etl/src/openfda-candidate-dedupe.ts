import { createHash } from 'node:crypto'
import type { OpenFdaRelevantSection } from './openfda-label-reader'
import {
  OPENFDA_EXTRACTION_VERSION,
  type OpenFdaCandidateConfidence,
  type OpenFdaCandidateEvidence,
  type OpenFdaCandidateTrigger,
  type OpenFdaInteractionCandidate,
  type OpenFdaLabelRecord,
  type OpenFdaSubstanceMatch,
} from './openfda-types'

const CONFIDENCE_RANK: Record<OpenFdaCandidateConfidence, number> = {
  low: 1,
  medium: 2,
  high: 3,
}

function stableId(prefix: string, value: string) {
  return `${prefix}_${createHash('sha256').update(value).digest('hex').slice(0, 24)}`
}

function stringValues(value: unknown) {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : []
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((item): item is string => typeof item === 'string'))].sort()
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const [first] = stringValues(value)
    if (first) return first
  }
  return ''
}

export function scoreOpenFdaCandidateConfidence(
  match: OpenFdaSubstanceMatch,
  section: OpenFdaRelevantSection,
  trigger: OpenFdaCandidateTrigger,
): OpenFdaCandidateConfidence {
  if (match.ambiguous || match.tier === 'secondary_generic_match') return 'low'
  if (
    ['exact_rxcui_match', 'exact_substance_name_match'].includes(match.tier) &&
    section.priority <= 2 &&
    trigger.signal === 'explicit_directive'
  ) {
    return 'high'
  }
  if (match.tier === 'normalized_substance_name_match' || trigger.signal === 'explicit_effect') {
    return 'medium'
  }
  return section.priority <= 5 ? 'medium' : 'low'
}

export function openFdaLogicalCandidateKey(
  match: OpenFdaSubstanceMatch,
  trigger: OpenFdaCandidateTrigger,
) {
  return [
    match.seed.medicationSubstanceId,
    trigger.target,
    trigger.action,
    trigger.qualifier ?? '',
    trigger.beforeMinutes ?? '',
    trigger.afterMinutes ?? '',
    trigger.extractionReason,
  ].join('\0')
}

export type OpenFdaEvidenceInput = {
  record: OpenFdaLabelRecord
  recordHash: string
  partitionFile: string
  retrievedAt: string
  match: OpenFdaSubstanceMatch
  section: OpenFdaRelevantSection
  trigger: OpenFdaCandidateTrigger
}

export class OpenFdaCandidateAccumulator {
  private readonly candidateByKey = new Map<string, OpenFdaInteractionCandidate>()
  private readonly evidenceById = new Map<string, OpenFdaCandidateEvidence>()

  add(input: OpenFdaEvidenceInput) {
    const { record, recordHash, partitionFile, retrievedAt, match, section, trigger } = input
    const logicalKey = openFdaLogicalCandidateKey(match, trigger)
    const candidateId = stableId('ofci', logicalKey)
    const confidence = scoreOpenFdaCandidateConfidence(match, section, trigger)
    const current = this.candidateByKey.get(logicalKey)
    if (!current) {
      this.candidateByKey.set(logicalKey, {
        id: candidateId,
        medicationSubstanceId: match.seed.medicationSubstanceId,
        canonicalName: match.seed.canonicalName,
        rxcui: match.seed.rxcui,
        targetType: trigger.targetType,
        target: trigger.target,
        action: trigger.action,
        qualifier: trigger.qualifier,
        beforeMinutes: trigger.beforeMinutes,
        afterMinutes: trigger.afterMinutes,
        extractionReason: trigger.extractionReason,
        candidateConfidence: confidence,
        status: 'candidate',
        reviewRequired: true,
        notForProduction: true,
        clinicalRecommendation: null,
        evidenceCount: 0,
      })
    } else if (CONFIDENCE_RANK[confidence] > CONFIDENCE_RANK[current.candidateConfidence]) {
      current.candidateConfidence = confidence
    }

    const splSetId = firstString(record.set_id, record.openfda?.spl_set_id)
    if (!splSetId) throw new Error('openFDA candidate evidence SPL set ID içermiyor')
    const evidenceIdentity = [
      candidateId,
      splSetId,
      recordHash,
      section.name,
      createHash('sha256').update(trigger.evidenceSnippet).digest('hex'),
    ].join('\0')
    const evidenceId = stableId('ofce', evidenceIdentity)
    if (!this.evidenceById.has(evidenceId)) {
      this.evidenceById.set(evidenceId, {
        id: evidenceId,
        candidateId,
        sourceSystem: 'openfda',
        splSetId,
        effectiveTime: firstString(record.effective_time) || null,
        labelPartitionFile: partitionFile,
        productIdentifiers: {
          applicationNumbers: stringValues(record.openfda?.application_number),
          productNdcs: stringValues(record.openfda?.product_ndc),
          packageNdcs: stringValues(record.openfda?.package_ndc),
          brandNames: stringValues(record.openfda?.brand_name),
        },
        matchedSection: section.name,
        evidenceSnippet: trigger.evidenceSnippet,
        recordHash,
        retrievedAt,
        extractionVersion: OPENFDA_EXTRACTION_VERSION,
        labelMatchTier: match.tier,
        matchedField: match.matchedField,
        matchedValue: match.matchedValue,
        confidence,
        ambiguous: match.ambiguous,
      })
      this.candidateByKey.get(logicalKey)!.evidenceCount += 1
    }
  }

  result() {
    return {
      candidates: [...this.candidateByKey.values()].sort((a, b) => a.id.localeCompare(b.id)),
      evidence: [...this.evidenceById.values()].sort((a, b) => a.id.localeCompare(b.id)),
    }
  }
}

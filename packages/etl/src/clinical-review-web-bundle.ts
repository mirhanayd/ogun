import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import {
  resolveClinicalInteractionTarget,
  type ClinicalTargetResolution,
} from './clinical-interaction-targets'
import {
  clinicalReviewPriority,
  representativeEvidence,
  type ClinicalReviewPriority,
} from './clinical-review-pack'
import {
  OPENFDA_CANDIDATE_FILE,
  OPENFDA_EVIDENCE_FILE,
  OPENFDA_SUMMARY_FILE,
  type OpenFdaExtractionSummary,
} from './openfda-review-export'
import type {
  OpenFdaCandidateEvidence,
  OpenFdaInteractionCandidate,
} from './openfda-types'

export interface CompactCandidateIndexItem {
  candidateId: string
  ogunSubstance: string
  medicationSubstanceId: string
  rxcui: string
  targetType: string
  candidateTarget: string
  resolvedTargetKey: string
  action: string
  reviewPriority: ClinicalReviewPriority
  candidateConfidence: 'high' | 'medium' | 'low'
  ingredientAttribution: string
  evidenceCount: number
  splCount: number
  requiredCapability: string
}

export interface CompactSnapshotIndex {
  candidateSemanticHash: string
  totalCandidates: number
  counts: Record<ClinicalReviewPriority, number>
  generatedAt: string
  candidates: CompactCandidateIndexItem[]
}

export interface CandidateTechnicalPreReview {
  suggestedReviewPriority: ClinicalReviewPriority
  suggestedTargetKey: string
  targetResolutionStatus: string
  attributionWarning?: string | null
  timingWarning?: string | null
  scopeWarning?: string | null
}

export interface CandidateDetailBundle {
  candidate: OpenFdaInteractionCandidate
  candidateSemanticHash: string
  priority: ClinicalReviewPriority
  targetResolution: ClinicalTargetResolution
  technicalPreReview: CandidateTechnicalPreReview
  representativeEvidence: OpenFdaCandidateEvidence
  evidenceList: OpenFdaCandidateEvidence[]
}

export function readGzipJsonl<T>(filePath: string): T[] {
  const decompressed = gunzipSync(readFileSync(filePath)).toString('utf8')
  return decompressed
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T)
}

export function determineRequiredCapability(
  candidate: OpenFdaInteractionCandidate,
): string {
  if (candidate.targetType === 'meal_timing') return 'medication_timing'
  if (candidate.targetType === 'supplement') return 'medication_supplement'
  if (candidate.targetType === 'nutrient' && candidate.action === 'separate_timing') {
    return 'medication_timing'
  }
  return 'medication_food'
}

export function buildTechnicalPreReview(
  candidate: OpenFdaInteractionCandidate,
  targetResolution: ClinicalTargetResolution,
  priority: ClinicalReviewPriority,
): CandidateTechnicalPreReview {
  let attributionWarning: string | null = null
  if (
    candidate.ingredientAttribution === 'multi_ingredient_unattributed' ||
    candidate.ingredientAttribution === 'secondary_match_uncertain'
  ) {
    attributionWarning =
      'Multi-ingredient label with uncertain attribution. Active substance attribution confirmation is strictly required.'
  }

  let timingWarning: string | null = null
  if (candidate.targetType === 'meal_timing') {
    timingWarning = 'Meal timing rule: verify fasting vs post-prandial administration instructions.'
  }

  let scopeWarning: string | null = null
  if (candidate.candidateConfidence === 'low') {
    scopeWarning = 'Low extraction confidence: carefully verify FDA section text against candidate target.'
  }

  return {
    suggestedReviewPriority: priority,
    suggestedTargetKey: targetResolution.targetKey ?? '',
    targetResolutionStatus: targetResolution.status,
    attributionWarning,
    timingWarning,
    scopeWarning,
  }
}

/**
 * Builds deterministic compact web review bundles for the openFDA candidates.
 */
export function generateClinicalReviewWebBundles(options: {
  baseDir: string
  outputDir: string
}): {
  index: CompactSnapshotIndex
  bundleFilesCount: number
  totalBytes: number
  semanticHash: string
} {
  const extractedDir = path.join(options.baseDir, 'extracted')
  const candidateFile = path.join(extractedDir, OPENFDA_CANDIDATE_FILE)
  const evidenceFile = path.join(extractedDir, OPENFDA_EVIDENCE_FILE)
  const summaryFile = path.join(extractedDir, OPENFDA_SUMMARY_FILE)

  if (!existsSync(candidateFile) || !existsSync(evidenceFile) || !existsSync(summaryFile)) {
    throw new Error(
      `Required openFDA extracted artifacts missing in ${extractedDir}`,
    )
  }

  const candidates = readGzipJsonl<OpenFdaInteractionCandidate>(candidateFile)
  const evidence = readGzipJsonl<OpenFdaCandidateEvidence>(evidenceFile)
  const summary = JSON.parse(readFileSync(summaryFile, 'utf8')) as OpenFdaExtractionSummary

  const semanticHash = summary.extraction.semanticHash

  // Group evidence by candidate
  const evidenceByCandidate = new Map<string, OpenFdaCandidateEvidence[]>()
  for (const item of evidence) {
    const list = evidenceByCandidate.get(item.candidateId) ?? []
    list.push(item)
    evidenceByCandidate.set(item.candidateId, list)
  }

  const snapshotDir = path.join(options.outputDir, 'snapshots', semanticHash)
  const candidatesDir = path.join(snapshotDir, 'candidates')
  mkdirSync(candidatesDir, { recursive: true })

  const counts: Record<ClinicalReviewPriority, number> = {
    P1: 0,
    P2: 0,
    P3: 0,
    P4: 0,
    P5: 0,
  }

  const indexCandidates: CompactCandidateIndexItem[] = []
  let totalBytes = 0
  let bundleFilesCount = 0

  for (const candidate of candidates) {
    const candidateEvidence = evidenceByCandidate.get(candidate.id) ?? []
    const representative = representativeEvidence(candidateEvidence)
    if (!representative) {
      throw new Error(`Candidate has no representative evidence: ${candidate.id}`)
    }

    const priority = clinicalReviewPriority(candidate)
    counts[priority] += 1
    const targetResolution = resolveClinicalInteractionTarget(candidate.targetType, candidate.target)
    const requiredCapability = determineRequiredCapability(candidate)
    const splCount = new Set(candidateEvidence.map((e) => e.splSetId)).size

    indexCandidates.push({
      candidateId: candidate.id,
      ogunSubstance: candidate.canonicalName,
      medicationSubstanceId: candidate.medicationSubstanceId,
      rxcui: candidate.rxcui,
      targetType: candidate.targetType,
      candidateTarget: candidate.target,
      resolvedTargetKey: targetResolution.targetKey ?? '',
      action: candidate.action,
      reviewPriority: priority,
      candidateConfidence: candidate.candidateConfidence,
      ingredientAttribution: candidate.ingredientAttribution,
      evidenceCount: candidate.evidenceCount,
      splCount,
      requiredCapability,
    })

    const technicalPreReview = buildTechnicalPreReview(candidate, targetResolution, priority)

    // Bounded evidence: up to 15 unique evidence items per candidate
    // representative evidence first, followed by others sorted deterministically
    const sortedEvidence = [...candidateEvidence].sort((a, b) => {
      if (a.id === representative.id) return -1
      if (b.id === representative.id) return 1
      return (b.effectiveTime ?? '').localeCompare(a.effectiveTime ?? '') || a.id.localeCompare(b.id)
    })
    const boundedEvidence = sortedEvidence.slice(0, 15)

    const detailBundle: CandidateDetailBundle = {
      candidate,
      candidateSemanticHash: semanticHash,
      priority,
      targetResolution,
      technicalPreReview,
      representativeEvidence: representative,
      evidenceList: boundedEvidence,
    }

    const bundleJson = JSON.stringify(detailBundle)
    const bundleGz = gzipSync(bundleJson, { level: 9 })
    const bundlePath = path.join(candidatesDir, `${candidate.id}.json.gz`)
    writeFileSync(bundlePath, bundleGz)
    totalBytes += bundleGz.length
    bundleFilesCount += 1
  }

  const index: CompactSnapshotIndex = {
    candidateSemanticHash: semanticHash,
    totalCandidates: candidates.length,
    counts,
    generatedAt: summary.retrievedAt,
    candidates: indexCandidates.sort((a, b) => a.candidateId.localeCompare(b.candidateId)),
  }

  const indexJson = JSON.stringify(index, null, 2)
  const indexGz = gzipSync(indexJson, { level: 9 })
  writeFileSync(path.join(snapshotDir, 'index.json.gz'), indexGz)
  writeFileSync(path.join(snapshotDir, 'index.json'), indexJson)
  totalBytes += indexGz.length

  return {
    index,
    bundleFilesCount,
    totalBytes,
    semanticHash,
  }
}

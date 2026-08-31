import type { PreparedMapping, SubstanceIdentity } from './rxnorm-mapping'
import {
  DETERMINISTIC_VERIFICATION_METHOD,
  RXNORM_ALLOWED_TERM_TYPES,
  RXNORM_VERIFICATION_VERSION,
  type RxNormVerificationReport,
  type VerificationClassification,
  type VerificationReason,
  type VerificationTier,
} from './rxnorm-verification-types'

const METHOD_PRIORITY = {
  lexical_exact: 0,
  normalized_exact: 1,
  token_exact: 2,
  atc_bridge: 3,
  fuzzy: 4,
  manual: 5,
} as const

/**
 * Verification-safe normalization deliberately does not transliterate, stem,
 * reorder/drop tokens, expand abbreviations, or remove salt/hydrate/strength
 * semantics. It only case-folds and treats punctuation as spacing.
 */
export function safeExactNormalize(value: string) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/\u0307/g, '')
    .replace(/[\p{P}\p{Z}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isSafeNormalizedExact(sourcePhrase: string, rxnormTerm: string) {
  const source = safeExactNormalize(sourcePhrase)
  return source.length > 0 && source === safeExactNormalize(rxnormTerm)
}

function representative(items: PreparedMapping[]) {
  return [...items].sort((left, right) => {
    const leftMethod = left.candidate?.matchMethod ?? 'manual'
    const rightMethod = right.candidate?.matchMethod ?? 'manual'
    return (
      METHOD_PRIORITY[leftMethod] - METHOD_PRIORITY[rightMethod] ||
      left.row.source_phrase.localeCompare(right.row.source_phrase, 'tr') ||
      left.row.best_rxcui.localeCompare(right.row.best_rxcui, 'en', { numeric: true })
    )
  })[0]!
}

function deferredTier(items: PreparedMapping[]): {
  tier: VerificationTier
  reason: VerificationReason
} {
  const methods = new Set(items.flatMap((item) => (item.candidate ? [item.candidate.matchMethod] : [])))
  if (methods.has('normalized_exact')) return { tier: 'REVIEW_HIGH', reason: 'unsafe_normalization' }
  if (methods.has('atc_bridge')) return { tier: 'REVIEW_ATC', reason: 'atc_requires_review' }
  if (methods.has('token_exact')) return { tier: 'REVIEW_MANUAL', reason: 'token_requires_review' }
  if (methods.has('fuzzy')) return { tier: 'REVIEW_MANUAL', reason: 'fuzzy_requires_review' }
  return { tier: 'REVIEW_MANUAL', reason: 'manual_requires_review' }
}

function classification(
  substance: SubstanceIdentity,
  items: PreparedMapping[],
  tier: VerificationTier,
  reason: VerificationReason,
): VerificationClassification {
  const item = representative(items)
  const isVerified = tier === 'VERIFIED_EXACT'
  return {
    medicationSubstanceId: substance.id,
    canonicalName: substance.nameTr,
    sourcePhrase: item.row.source_phrase,
    rxcui: item.row.best_rxcui,
    rxnormTerm: item.row.best_rxnorm_name,
    tty: item.row.best_rxnorm_tty,
    matchMethod: item.candidate?.matchMethod ?? '',
    tier,
    reason,
    verificationMethod: isVerified ? DETERMINISTIC_VERIFICATION_METHOD : null,
    verificationVersion: RXNORM_VERIFICATION_VERSION,
  }
}

function emptyClassification(
  substance: SubstanceIdentity,
  item?: PreparedMapping,
): VerificationClassification {
  return {
    medicationSubstanceId: substance.id,
    canonicalName: substance.nameTr,
    sourcePhrase: item?.row.source_phrase ?? '',
    rxcui: item?.row.best_rxcui ?? '',
    rxnormTerm: item?.row.best_rxnorm_name ?? '',
    tty: item?.row.best_rxnorm_tty ?? '',
    matchMethod: item?.candidate?.matchMethod ?? '',
    tier: 'UNMAPPED',
    reason: item ? 'no_candidate' : 'no_candidate',
    verificationMethod: null,
    verificationVersion: RXNORM_VERIFICATION_VERSION,
  }
}

export function classifyRxNormMappings(
  prepared: PreparedMapping[],
  substances: SubstanceIdentity[],
): RxNormVerificationReport {
  const substanceById = new Map(substances.map((substance) => [substance.id, substance]))
  const resolvedBySubstance = new Map<string, PreparedMapping[]>()
  const candidateSubstancesByRxCui = new Map<string, Set<string>>()
  const unresolvedPhrases: VerificationClassification[] = []

  for (const item of prepared) {
    if (item.resolution.kind !== 'resolved') {
      unresolvedPhrases.push({
        medicationSubstanceId: null,
        canonicalName: '',
        sourcePhrase: item.row.source_phrase,
        rxcui: item.row.best_rxcui,
        rxnormTerm: item.row.best_rxnorm_name,
        tty: item.row.best_rxnorm_tty,
        matchMethod: item.row.match_method ? (item.candidate?.matchMethod ?? '') : '',
        tier: item.resolution.kind === 'ambiguous' ? 'AMBIGUOUS' : 'UNMAPPED',
        reason:
          item.resolution.kind === 'ambiguous'
            ? 'canonical_join_ambiguous'
            : 'canonical_join_unmapped',
        verificationMethod: null,
        verificationVersion: RXNORM_VERIFICATION_VERSION,
      })
      continue
    }
    const items = resolvedBySubstance.get(item.resolution.medicationSubstanceId) ?? []
    items.push(item)
    resolvedBySubstance.set(item.resolution.medicationSubstanceId, items)
    if (item.candidate) {
      const ids = candidateSubstancesByRxCui.get(item.candidate.externalId) ?? new Set<string>()
      ids.add(item.candidate.medicationSubstanceId)
      candidateSubstancesByRxCui.set(item.candidate.externalId, ids)
    }
  }

  const sharedRxCuiGroups = new Map(
    [...candidateSubstancesByRxCui]
      .filter(([, ids]) => ids.size > 1)
      .map(([rxcui, ids]) => [rxcui, [...ids].sort()] as const),
  )
  const multipleRxCuiSubstances = new Map<string, string[]>()
  const classifications: VerificationClassification[] = []

  for (const substance of substances) {
    const allItems = resolvedBySubstance.get(substance.id) ?? []
    const items = allItems.filter((item) => item.candidate)
    if (items.length === 0) {
      classifications.push(emptyClassification(substance, allItems[0]))
      continue
    }

    const rxcuis = [...new Set(items.map((item) => item.candidate!.externalId))].sort((a, b) =>
      a.localeCompare(b, 'en', { numeric: true }),
    )
    if (rxcuis.length > 1) {
      multipleRxCuiSubstances.set(substance.id, rxcuis)
      classifications.push(classification(substance, items, 'AMBIGUOUS', 'multiple_rxcui_review'))
      continue
    }
    if (sharedRxCuiGroups.has(rxcuis[0]!)) {
      classifications.push(classification(substance, items, 'AMBIGUOUS', 'shared_rxcui_review'))
      continue
    }

    const termTypes = new Set(items.map((item) => item.candidate!.externalTermType ?? ''))
    if (
      termTypes.size !== 1 ||
      !RXNORM_ALLOWED_TERM_TYPES.includes([...termTypes][0] as 'IN' | 'PIN' | 'MIN')
    ) {
      classifications.push(classification(substance, items, 'REVIEW_MANUAL', 'invalid_rxnorm_tty'))
      continue
    }
    const tty = [...termTypes][0]!
    if (substance.isCombination && tty !== 'MIN') {
      classifications.push(
        classification(substance, items, 'REVIEW_MANUAL', 'combination_requires_min'),
      )
      continue
    }
    if (!substance.isCombination && tty === 'MIN') {
      classifications.push(
        classification(substance, items, 'REVIEW_MANUAL', 'single_ingredient_rejects_min'),
      )
      continue
    }

    const conflictingAtc = items.some(
      (item) =>
        item.row.atc_mapped_rxcui.trim().length > 0 &&
        item.row.atc_mapped_rxcui.trim() !== item.candidate!.externalId,
    )
    if (conflictingAtc) {
      classifications.push(classification(substance, items, 'AMBIGUOUS', 'conflicting_evidence'))
      continue
    }

    if (items.some((item) => item.candidate!.matchMethod === 'lexical_exact')) {
      classifications.push(classification(substance, items, 'VERIFIED_EXACT', 'unique_lexical_exact'))
      continue
    }
    if (
      items.some(
        (item) =>
          item.candidate!.matchMethod === 'normalized_exact' &&
          isSafeNormalizedExact(item.row.source_phrase, item.row.best_rxnorm_name),
      )
    ) {
      classifications.push(
        classification(substance, items, 'VERIFIED_EXACT', 'unique_safe_normalized_exact'),
      )
      continue
    }

    const deferred = deferredTier(items)
    classifications.push(classification(substance, items, deferred.tier, deferred.reason))
  }

  // A resolver returning a non-existent ID is an integrity error, not an
  // opportunity to manufacture a canonical identity.
  for (const substanceId of resolvedBySubstance.keys()) {
    if (!substanceById.has(substanceId)) {
      throw new Error(`RxNorm canonical join orphan substance: ${substanceId}`)
    }
  }

  classifications.sort((a, b) => a.canonicalName.localeCompare(b.canonicalName, 'tr'))
  unresolvedPhrases.sort((a, b) => a.sourcePhrase.localeCompare(b.sourcePhrase, 'tr'))
  return { classifications, unresolvedPhrases, sharedRxCuiGroups, multipleRxCuiSubstances }
}

import type { OpenFdaRelevantSection } from './openfda-label-reader'
import { OPENFDA_TARGET_VOCABULARY, type OpenFdaTargetDefinition } from './openfda-target-vocabulary'
import type {
  OpenFdaCandidateAction,
  OpenFdaCandidateTrigger,
} from './openfda-types'

const NEGATIVE_CONTEXT = [
  /\bwith or without food\b/i,
  /\bfood (?:has|had) no (?:clinically significant )?effect\b/i,
  /\bfood does not (?:affect|alter)\b/i,
  /\bno (?:clinically significant )?(?:food|meal) effect\b/i,
  /\bconsult (?:a |your )?(?:doctor|physician)\b/i,
]

const EFFECT_PATTERN =
  /\b(?:increase[sd]?|decrease[sd]?|reduce[sd]?|enhance[sd]?|impair[sd]?|affect(?:s|ed)?|bioavailability|exposure|absorption|toxicity|risk)\b/i

function evidenceWindow(text: string, start: number, end: number) {
  const leftLimit = Math.max(0, start - 220)
  const rightLimit = Math.min(text.length, end + 260)
  const leftBoundary = Math.max(
    text.lastIndexOf('.', start - 1),
    text.lastIndexOf(';', start - 1),
    text.lastIndexOf('\n', start - 1),
    leftLimit,
  )
  const candidates = [text.indexOf('.', end), text.indexOf(';', end), text.indexOf('\n', end)]
    .filter((value) => value >= end && value <= rightLimit)
    .sort((a, b) => a - b)
  const rightBoundary = candidates[0] ?? rightLimit
  return text
    .slice(leftBoundary === leftLimit ? leftBoundary : leftBoundary + 1, rightBoundary + 1)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 480)
}

function timingOffsets(snippet: string) {
  let beforeMinutes: number | null = null
  let afterMinutes: number | null = null
  for (const match of snippet.matchAll(/(\d+(?:\.\d+)?)\s*(minutes?|hours?)\s*(before|after)\b/gi)) {
    const value = Number(match[1]) * (match[2]!.toLowerCase().startsWith('hour') ? 60 : 1)
    if (match[3]!.toLowerCase() === 'before') beforeMinutes = value
    else afterMinutes = value
  }
  const within = /\bwithin\s+(\d+(?:\.\d+)?)\s*(minutes?|hours?)\b/i.exec(snippet)
  if (within && beforeMinutes === null && afterMinutes === null) {
    const value = Number(within[1]) * (within[2]!.toLowerCase().startsWith('hour') ? 60 : 1)
    beforeMinutes = value
    afterMinutes = value
  }
  return { beforeMinutes, afterMinutes }
}

function actionFor(
  definition: OpenFdaTargetDefinition,
  snippet: string,
): { action: OpenFdaCandidateAction; signal: OpenFdaCandidateTrigger['signal'] } | null {
  if (NEGATIVE_CONTEXT.some((pattern) => pattern.test(snippet))) return null
  const directive = /\b(?:take|administer|give|dose|consume|eat|drink|avoid|limit|restrict)\b/i.test(
    snippet,
  )
  if (
    definition.target === 'alcohol' &&
    /\b(?:avoid|do not|should not|must not|abstain)\b.{0,100}\b(?:alcohol|ethanol|alcoholic)/i.test(
      snippet,
    )
  ) {
    return { action: 'avoid_alcohol', signal: 'explicit_directive' }
  }
  if (/\b(?:take|administer|given|give|dose)\b.{0,100}\bwith (?:a )?(?:meal|food)\b/i.test(snippet)) {
    return { action: 'take_with_food', signal: 'explicit_directive' }
  }
  if (
    /\b(?:take|administer|given|give|dose)\b.{0,120}\b(?:without food|on an empty stomach|fasting)\b/i.test(
      snippet,
    )
  ) {
    return { action: 'take_without_food', signal: 'explicit_directive' }
  }
  if (
    /\b(?:within|separate|apart|before|after)\b.{0,120}\b(?:minutes?|hours?|meal|food|feeding|calcium|iron|magnesium|zinc|antacid|mineral)/i.test(
      snippet,
    ) ||
    /\b(?:minutes?|hours?)\b.{0,60}\b(?:before|after|apart)\b/i.test(snippet)
  ) {
    return { action: 'separate_timing', signal: directive ? 'explicit_directive' : 'explicit_effect' }
  }
  if (/\b(?:consistent|consistency|same way each time|maintain a stable)\b/i.test(snippet)) {
    return { action: 'consistency', signal: directive ? 'explicit_directive' : 'explicit_effect' }
  }
  if (/\b(?:avoid|do not|should not|must not|contraindicated)\b/i.test(snippet)) {
    return { action: 'avoid', signal: 'explicit_directive' }
  }
  if (/\b(?:limit|restrict|reduce consumption)\b/i.test(snippet)) {
    return { action: 'limit', signal: 'explicit_directive' }
  }
  if (/\bmonitor(?:ing|ed)?\b|\bclosely monitor\b/i.test(snippet)) {
    return { action: 'monitor', signal: directive ? 'explicit_directive' : 'explicit_effect' }
  }
  if (/\b(?:individualize|individualized|based on dietary intake)\b/i.test(snippet)) {
    return { action: 'individualize', signal: 'explicit_directive' }
  }
  if (/\b(?:caution|use caution|care should be taken)\b/i.test(snippet)) {
    return { action: 'caution', signal: 'explicit_directive' }
  }
  if (EFFECT_PATTERN.test(snippet)) return { action: 'caution', signal: 'explicit_effect' }
  return null
}

function qualifierFor(snippet: string) {
  if (/\bbefore (?:a )?(?:meal|food)\b/i.test(snippet)) return 'before_meal'
  if (/\bafter (?:a )?(?:meal|food)\b/i.test(snippet)) return 'after_meal'
  if (/\bat bedtime\b/i.test(snippet)) return 'bedtime'
  if (/\bempty stomach\b|\bfast(?:ed|ing)\b/i.test(snippet)) return 'fasting'
  return null
}

export function extractOpenFdaCandidateTriggers(
  section: OpenFdaRelevantSection,
): OpenFdaCandidateTrigger[] {
  const triggers: OpenFdaCandidateTrigger[] = []
  for (const definition of OPENFDA_TARGET_VOCABULARY) {
    definition.pattern.lastIndex = 0
    for (const match of section.text.matchAll(definition.pattern)) {
      const start = match.index ?? 0
      const snippet = evidenceWindow(section.text, start, start + match[0].length)
      if (definition.target === 'grapefruit' && /\bgrapefruit juice\b/i.test(snippet)) continue
      if (
        definition.target === 'food_general' &&
        /\b(?:with food|without food|before (?:a )?meal|after (?:a )?meal)\b/i.test(snippet)
      ) {
        continue
      }
      if (
        definition.generic &&
        OPENFDA_TARGET_VOCABULARY.some(
          (other) =>
            !other.generic &&
            other.target !== definition.target &&
            new RegExp(other.pattern.source, other.pattern.flags.replace('g', '')).test(snippet),
        )
      ) {
        continue
      }
      const action = actionFor(definition, snippet)
      if (!action) continue
      const offsets = timingOffsets(snippet)
      triggers.push({
        targetType: definition.type,
        target: definition.target,
        action: action.action,
        qualifier: qualifierFor(snippet),
        beforeMinutes: offsets.beforeMinutes,
        afterMinutes: offsets.afterMinutes,
        extractionReason: `${definition.target}:${action.action}:deterministic_phrase`,
        evidenceSnippet: snippet,
        signal: action.signal,
      })
    }
  }
  return triggers
}

import type { OpenFdaRelevantSection } from './openfda-label-reader'
import {
  OPENFDA_TARGET_VOCABULARY,
  type OpenFdaTargetDefinition,
} from './openfda-target-vocabulary'
import type { OpenFdaCandidateAction, OpenFdaCandidateTrigger } from './openfda-types'

const NEGATIVE_CONTEXT = [
  /\bwith or without food\b/i,
  /\bfood (?:has|had) no (?:clinically significant )?effect\b/i,
  /\bfood does not (?:affect|alter)\b/i,
  /\bno (?:clinically significant )?(?:food|meal) effect\b/i,
  /\bno clinically significant (?:changes?|effects?|impact)\b/i,
  /\b(?:has|have|had) no impact\b/i,
  /\b(?:does|do|did) not (?:affect|alter|modify)\b/i,
  /\b(?:was|were|is|are) not (?:affected|altered|modified)\b/i,
  /\bcomparable to (?:that )?(?:observed|seen|measured)\b/i,
  /\bwithout regards? (?:to|for) (?:the )?timing of meals?\b/i,
  /\bask (?:a |your )?(?:doctor|physician)\b/i,
  /\bconsult (?:a |your )?(?:doctor|physician)\b/i,
]

const EFFECT_PATTERN =
  /\b(?:increase[sd]?|decrease[sd]?|reduce[sd]?|enhance[sd]?|impair[sd]?|affect(?:s|ed)?|bioavailability|exposure|absorption|toxicity|risk)\b/i

const CONTEXT_GATED_NUTRIENTS = new Set([
  'calcium',
  'iron',
  'magnesium',
  'zinc',
  'potassium',
  'sodium',
  'protein',
])

function hasDietaryNutrientContext(target: string, snippet: string) {
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(
    String.raw`\b${escaped}[- ]containing\s+(?:products?|foods?|beverages?|supplements?)\b|\bproducts?\s+(?:containing|with)\s+${escaped}\b|\b(?:dietary|diet|intake|supplements?|foods?|beverages?|antacids?|minerals?|milk|dairy|restriction|amounts?)\b.{0,100}\b${escaped}\b|\b${escaped}\b.{0,100}\b(?:dietary|diet|intake|supplements?|foods?|beverages?|antacids?|minerals?|milk|dairy|restriction)\b`,
    'i',
  ).test(snippet)
}

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
  for (const match of snippet.matchAll(
    /(\d+(?:\.\d+)?)\s*(minutes?|hours?)\s*(before|after)\b/gi,
  )) {
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
  if (
    definition.target === 'alcohol' &&
    (/\b(?:benzyl|cetyl|isopropyl|polyvinyl|stearyl) alcohol\b/i.test(snippet) ||
      /\balcohol[- ]free\b|\balcohol[- ]based\b|\balcohol(?:[\s,-]+.{0,40})?\bcontaining products?\b|\bmouthwashes?\b/i.test(
        snippet,
      ))
  ) {
    return null
  }
  if (
    (definition.target === 'milk' || definition.target === 'dairy') &&
    /\b(?:breast|human) milk\b|\blactat(?:ing|ion)\b|\bnursing mothers?\b|\bmilk (?:production|quantity|quality)\b/i.test(
      snippet,
    )
  ) {
    return null
  }
  if (
    definition.target === 'calcium' &&
    /\bcalcium channel (?:blockers?|blocking agents?)\b|\b(?:serum|urinary|blood) calcium\b|\bcalcium (?:levels?|concentrations?|excretion|oxalate|calculi)\b|\b(?:levels?|concentrations?|excretion) of calcium\b|\bcalcium and phosphate solution\b|\bpremature neonates?\b|\b(?:hyper|hypo)calcemia\b/i.test(
      snippet,
    ) &&
    !/\b(?:dietary|intake|supplements?|products?|foods?|milk|dairy|antacids?)\b.{0,80}\bcalcium\b|\bcalcium[- ]containing\b/i.test(
      snippet,
    )
  ) {
    return null
  }
  if (
    definition.target === 'sodium' &&
    !/\b(?:dietary sodium|sodium intake|sodium[- ]restrict(?:ed|ion)|salt substitutes?)\b/i.test(
      snippet,
    )
  ) {
    return null
  }
  if (
    definition.target === 'potassium' &&
    !/\b(?:dietary potassium|potassium intake|potassium supplements?|salt substitutes? containing potassium|foods? (?:high|rich) in potassium)\b/i.test(
      snippet,
    )
  ) {
    return null
  }
  if (
    CONTEXT_GATED_NUTRIENTS.has(definition.target) &&
    !hasDietaryNutrientContext(definition.target, snippet)
  ) {
    return null
  }
  const directive =
    /\b(?:take|administer|give|dose|consume|eat|drink|avoid|limit|restrict)\b/i.test(snippet)
  if (
    definition.target === 'alcohol' &&
    /\b(?:avoid|do not|should not|must not|abstain)\b.{0,100}\b(?:alcohol|ethanol|alcoholic)/i.test(
      snippet,
    )
  ) {
    return { action: 'avoid_alcohol', signal: 'explicit_directive' }
  }
  if (
    ['meals_general', 'high_fat_meal'].includes(definition.target) &&
    /\b(?:take|administer)\b.{0,100}\b(?:with (?:a )?(?:meal|food)|after (?:a )?meals?)\b/i.test(
      snippet,
    )
  ) {
    return { action: 'take_with_food', signal: 'explicit_directive' }
  }
  if (
    ['meals_general', 'fasting'].includes(definition.target) &&
    /\b(?:take|administer|should be administered|must be administered)\b.{0,120}\b(?:without food|on an empty stomach|fasting)\b/i.test(
      snippet,
    )
  ) {
    return { action: 'take_without_food', signal: 'explicit_directive' }
  }
  if (
    /\b(?:take|administer|give|dose|consume|place)\b.{0,100}\b(?:at least\s+)?\d+(?:\.\d+)?\s*(?:minutes?|hours?)\s*(?:before|after|apart)\b/i.test(
      snippet,
    ) ||
    /\b(?:do not|should not|must not|avoid)\s+(?:take|administer|give|dose|consume)?\b.{0,80}\bwithin\s+\d+(?:\.\d+)?\s*(?:minutes?|hours?)\s+of\b/i.test(
      snippet,
    ) ||
    /\b(?:take|administer|give|dose|consume|place)\b.{0,100}\b(?:before|after)\s+(?:a\s+)?(?:meals?|food|feeding)\b/i.test(
      snippet,
    ) ||
    /\bseparate\b.{0,100}\b(?:meals?|food|feeding|calcium|iron|magnesium|zinc|antacids?|minerals?)\b/i.test(
      snippet,
    )
  ) {
    return {
      action: 'separate_timing',
      signal: directive ? 'explicit_directive' : 'explicit_effect',
    }
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
  if (
    (definition.type === 'meal_timing' || definition.target === 'food_general') &&
    !/\b(?:increase[sd]?|decrease[sd]?|reduce[sd]?|enhance[sd]?|impair[sd]?|affect(?:s|ed)?|alter(?:s|ed)?|modif(?:y|ies|ied))\b/i.test(
      snippet,
    )
  ) {
    return null
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

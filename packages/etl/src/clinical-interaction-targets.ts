import { createHash } from 'node:crypto'
import type { OpenFdaTargetType } from './openfda-types'

export type ClinicalTargetConceptDefinition = {
  id: string
  type: Exclude<OpenFdaTargetType, 'nutrient'>
  key: string
  nameTr: string
  nameEn: string
}

export type ClinicalTargetResolution =
  | {
      status: 'resolved'
      kind: 'nutrient'
      candidateTarget: string
      targetType: OpenFdaTargetType
      targetKey: string
      nutrientCode: string
      clinicalTarget: null
    }
  | {
      status: 'resolved'
      kind: 'clinical_target'
      candidateTarget: string
      targetType: Exclude<OpenFdaTargetType, 'nutrient'>
      targetKey: string
      nutrientCode: null
      clinicalTarget: ClinicalTargetConceptDefinition
    }
  | {
      status: 'unresolved' | 'ambiguous'
      kind: null
      candidateTarget: string
      targetType: OpenFdaTargetType
      targetKey: null
      nutrientCode: null
      clinicalTarget: null
      reason: string
    }

type NutrientDefinition = {
  targetType: 'nutrient' | 'food_component'
  nutrientCode: string
}

const NUTRIENT_TARGETS: Readonly<Record<string, NutrientDefinition>> = {
  vitamin_k: { targetType: 'nutrient', nutrientCode: 'VITK1' },
  calcium: { targetType: 'nutrient', nutrientCode: 'CA' },
  iron: { targetType: 'nutrient', nutrientCode: 'FE' },
  magnesium: { targetType: 'nutrient', nutrientCode: 'MG' },
  zinc: { targetType: 'nutrient', nutrientCode: 'ZN' },
  potassium: { targetType: 'nutrient', nutrientCode: 'K' },
  sodium: { targetType: 'nutrient', nutrientCode: 'NA' },
  protein: { targetType: 'nutrient', nutrientCode: 'PROCNT' },
  caffeine: { targetType: 'food_component', nutrientCode: 'CAFFN' },
  fat: { targetType: 'food_component', nutrientCode: 'FAT' },
}

const CONCEPT_INPUTS = [
  ['food', 'grapefruit_juice', 'Greyfurt suyu', 'Grapefruit juice'],
  ['food', 'grapefruit', 'Greyfurt', 'Grapefruit'],
  ['food_component', 'tyramine', 'Tiramin', 'Tyramine'],
  ['food_group', 'dairy', 'Süt ürünleri', 'Dairy products'],
  ['food', 'milk', 'Süt', 'Milk'],
  ['food_group', 'enteral_nutrition', 'Enteral beslenme', 'Enteral nutrition'],
  ['supplement', 'mineral_supplements', 'Mineral takviyeleri', 'Mineral supplements'],
  ['supplement', 'antacids', 'Antasitler', 'Antacids'],
  ['alcohol', 'alcohol', 'Alkol', 'Alcohol'],
  ['meal_timing', 'fasting', 'Açlık durumu', 'Fasting'],
  ['meal_timing', 'bedtime', 'Uyku zamanı', 'Bedtime'],
  ['meal_timing', 'meals_general', 'Öğünlerle ilişki', 'Meals'],
  ['food', 'food_general', 'Genel besin alımı', 'Food'],
  ['meal_timing', 'high_fat_meal', 'Yüksek yağlı öğün', 'High-fat meal'],
] as const satisfies ReadonlyArray<
  readonly [Exclude<OpenFdaTargetType, 'nutrient'>, string, string, string]
>

function conceptId(type: string, key: string) {
  return `ctc_${createHash('sha256').update(`${type}\0${key}`).digest('hex').slice(0, 24)}`
}

export const CLINICAL_TARGET_CONCEPT_DEFINITIONS: readonly ClinicalTargetConceptDefinition[] =
  CONCEPT_INPUTS.map(([type, key, nameTr, nameEn]) => ({
    id: conceptId(type, key),
    type,
    key,
    nameTr,
    nameEn,
  }))

const CONCEPT_BY_KEY = new Map(
  CLINICAL_TARGET_CONCEPT_DEFINITIONS.map((definition) => [definition.key, definition]),
)

export function resolveClinicalInteractionTarget(
  targetType: OpenFdaTargetType,
  target: string,
): ClinicalTargetResolution {
  const nutrient = NUTRIENT_TARGETS[target]
  if (nutrient) {
    if (nutrient.targetType !== targetType) {
      return {
        status: 'ambiguous',
        kind: null,
        candidateTarget: target,
        targetType,
        targetKey: null,
        nutrientCode: null,
        clinicalTarget: null,
        reason: `target_type_mismatch:${nutrient.targetType}:${targetType}`,
      }
    }
    return {
      status: 'resolved',
      kind: 'nutrient',
      candidateTarget: target,
      targetType,
      targetKey: `nutrient:${nutrient.nutrientCode}`,
      nutrientCode: nutrient.nutrientCode,
      clinicalTarget: null,
    }
  }

  const clinicalTarget = CONCEPT_BY_KEY.get(target)
  if (!clinicalTarget) {
    return {
      status: 'unresolved',
      kind: null,
      candidateTarget: target,
      targetType,
      targetKey: null,
      nutrientCode: null,
      clinicalTarget: null,
      reason: 'unknown_candidate_target',
    }
  }
  if (clinicalTarget.type !== targetType) {
    return {
      status: 'ambiguous',
      kind: null,
      candidateTarget: target,
      targetType,
      targetKey: null,
      nutrientCode: null,
      clinicalTarget: null,
      reason: `target_type_mismatch:${clinicalTarget.type}:${targetType}`,
    }
  }
  return {
    status: 'resolved',
    kind: 'clinical_target',
    candidateTarget: target,
    targetType: clinicalTarget.type,
    targetKey: `${clinicalTarget.type}:${clinicalTarget.key}`,
    nutrientCode: null,
    clinicalTarget,
  }
}

export function resolveApprovedTargetKey(targetKey: string) {
  if (targetKey.startsWith('nutrient:')) {
    const nutrientCode = targetKey.slice('nutrient:'.length)
    const definition = Object.values(NUTRIENT_TARGETS).find(
      (item) => item.nutrientCode === nutrientCode,
    )
    return definition
      ? { kind: 'nutrient' as const, nutrientCode, targetType: definition.targetType }
      : null
  }
  const separator = targetKey.indexOf(':')
  if (separator < 1) return null
  const type = targetKey.slice(0, separator)
  const key = targetKey.slice(separator + 1)
  const clinicalTarget = CONCEPT_BY_KEY.get(key)
  if (!clinicalTarget || clinicalTarget.type !== type) return null
  return { kind: 'clinical_target' as const, clinicalTarget, targetType: clinicalTarget.type }
}

export function summarizeTargetResolutions(
  candidates: ReadonlyArray<{ targetType: OpenFdaTargetType; target: string }>,
) {
  let resolved = 0
  let nutrient = 0
  let clinicalTarget = 0
  let unresolved = 0
  let ambiguous = 0
  const unresolvedKeys = new Set<string>()
  const ambiguousKeys = new Set<string>()
  for (const candidate of candidates) {
    const resolution = resolveClinicalInteractionTarget(candidate.targetType, candidate.target)
    if (resolution.status === 'resolved') {
      resolved += 1
      if (resolution.kind === 'nutrient') nutrient += 1
      else clinicalTarget += 1
    } else if (resolution.status === 'unresolved') {
      unresolved += 1
      unresolvedKeys.add(`${candidate.targetType}:${candidate.target}`)
    } else {
      ambiguous += 1
      ambiguousKeys.add(`${candidate.targetType}:${candidate.target}`)
    }
  }
  return {
    candidates: candidates.length,
    resolved,
    nutrient,
    clinicalTarget,
    unresolved,
    ambiguous,
    unresolvedKeys: [...unresolvedKeys].sort(),
    ambiguousKeys: [...ambiguousKeys].sort(),
  }
}

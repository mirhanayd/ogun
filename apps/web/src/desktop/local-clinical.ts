import type { DomainEntity } from '@/data/repositories'
import { listFromText, type AnamnesisFormValues } from '@/lib/validation/anamnesis-schemas'

function normalizeLabel(value: string): string {
  return value
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9çğıöşü\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function uniqueLabels(labels: readonly string[]): string[] {
  const seen = new Set<string>()
  return labels.flatMap((label) => {
    const trimmed = label.trim()
    const key = normalizeLabel(trimmed)
    if (!key || seen.has(key)) return []
    seen.add(key)
    return [trimmed]
  })
}

export function withoutCatalogLabelsLocal(
  labels: readonly string[] | null | undefined,
  catalogLabels: readonly string[],
): string[] {
  const catalogKeys = new Set(catalogLabels.map(normalizeLabel))
  return uniqueLabels(labels ?? []).filter((label) => !catalogKeys.has(normalizeLabel(label)))
}

export function mergeClinicalLabelsLocal(
  legacyLabels: readonly string[],
  catalogLabels: readonly string[],
): string[] {
  return uniqueLabels([...legacyLabels, ...catalogLabels])
}

function arrayField<T>(entity: DomainEntity | null, key: string): T[] {
  return Array.isArray(entity?.[key]) ? (entity[key] as T[]) : []
}

export function localHealthRecord(anamnesis: DomainEntity | null) {
  const conditionSelections = arrayField<{ nameTr?: string }>(anamnesis, 'conditionSelections')
  const medicationSelections = arrayField<{ productName?: string | null; substanceName?: string | null; name?: string }>(anamnesis, 'medicationSelections')
  const conditionLabels = conditionSelections.flatMap((selection) => selection.nameTr ? [selection.nameTr] : [])
  const medicationLabels = medicationSelections.flatMap((selection) => {
    const label = selection.productName ?? selection.substanceName ?? selection.name
    return label ? [label] : []
  })
  const storedLegacyConditions = arrayField<string>(anamnesis, 'legacyConditions')
  const storedLegacyMedications = arrayField<string>(anamnesis, 'legacyMedications')
  return {
    ...(anamnesis ?? {}),
    healthRecord: anamnesis,
    legacyConditions: Array.isArray(anamnesis?.legacyConditions)
      ? storedLegacyConditions
      : withoutCatalogLabelsLocal(arrayField<string>(anamnesis, 'conditions'), conditionLabels),
    legacyMedications: Array.isArray(anamnesis?.legacyMedications)
      ? storedLegacyMedications
      : withoutCatalogLabelsLocal(arrayField<string>(anamnesis, 'medications'), medicationLabels),
    conditionSelections,
    medicationSelections,
  }
}

export function buildLocalAnamnesisEntity(
  clientId: string,
  values: AnamnesisFormValues,
  updatedAt = new Date().toISOString(),
): DomainEntity {
  const conditionCatalogLabels = values.conditionSelections.map((selection) => selection.nameTr)
  const medicationCatalogLabels = values.medicationSelections.map((selection) => selection.name)
  const legacyConditions = withoutCatalogLabelsLocal(
    listFromText(values.conditions),
    conditionCatalogLabels,
  )
  const legacyMedications = withoutCatalogLabelsLocal(
    listFromText(values.medications),
    medicationCatalogLabels,
  )
  return {
    id: clientId,
    clientId,
    legacyConditions,
    conditionSelections: values.conditionSelections,
    conditions: mergeClinicalLabelsLocal(legacyConditions, conditionCatalogLabels),
    legacyMedications,
    medicationSelections: values.medicationSelections,
    medications: mergeClinicalLabelsLocal(legacyMedications, medicationCatalogLabels),
    allergies: values.allergies,
    intolerances: values.intolerances,
    surgeries: values.surgeries || null,
    familyHistory: values.familyHistory || null,
    smokingStatus: values.smokingStatus || null,
    alcoholUse: values.alcoholUse || null,
    mealsPerDay: values.mealsPerDay ? Number(values.mealsPerDay) : null,
    eatingOutFrequency: values.eatingOutFrequency || null,
    waterIntakeMl: values.waterIntakeMl ? Number(values.waterIntakeMl) : null,
    activityLevel: values.activityLevel,
    activityNotes: values.activityNotes || null,
    sleepHours: values.sleepHours ? Number(values.sleepHours) : null,
    sleepQuality: values.sleepQuality || null,
    bowelHabits: values.bowelHabits || null,
    updatedAt,
  }
}

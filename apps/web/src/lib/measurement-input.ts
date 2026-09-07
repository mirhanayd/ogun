import { measurementFormSchema, type MeasurementFormValues } from './validation/measurement-schemas'

const numericFields = [
  'weightKg',
  'heightCm',
  'waistCm',
  'hipCm',
  'neckCm',
  'armCm',
  'thighCm',
  'chestCm',
  'bodyFatPct',
  'bodyFatKg',
  'leanMassKg',
  'muscleMassKg',
  'totalBodyWaterL',
  'visceralFatLevel',
  'bmrKcal',
  'phaseAngle',
] as const
export function measurementFormInput(input: MeasurementFormValues) {
  const values = measurementFormSchema.parse(input)
  if (values.deviceImport && values.source !== 'tanita')
    throw new Error('Cihaz verisi için Tanita kaynağını seçin.')
  const time = values.measuredTime
    ? values.measuredTime.length === 5
      ? `${values.measuredTime}:00`
      : values.measuredTime
    : '00:00:00'
  // The clinic's measurement date/time must not depend on the browser/host TZ.
  const measuredAt = new Date(`${values.measuredAt}T${time}${values.measuredTime ? '+03:00' : 'Z'}`)
  const numbers = Object.fromEntries(
    numericFields.map((key) => [
      key,
      values[key] === '' || values[key] === undefined ? null : Number(values[key]),
    ]),
  ) as Record<(typeof numericFields)[number], number | null>
  return {
    ...numbers,
    measuredAt,
    source: values.source,
    notes: values.notes || null,
    deviceImport: values.deviceImport ?? null,
  }
}

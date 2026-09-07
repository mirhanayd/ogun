import type { MeasurementDeviceImport } from '@ogun/db/measurement-device-import'
import type { MeasurementFormValues } from '@/lib/validation/measurement-schemas'

export function tanitaFormValues(
  current: MeasurementFormValues,
  deviceImport: MeasurementDeviceImport,
): MeasurementFormValues {
  const metric = deviceImport.normalizedPayload
  const text = (value: number | null) => (value === null ? '' : String(value))
  return {
    ...current,
    source: 'tanita',
    deviceImport,
    measuredAt: metric.date,
    measuredTime: metric.time,
    heightCm: text(metric.heightCm),
    weightKg: text(metric.weightKg),
    bodyFatPct: text(metric.bodyFatPct),
    muscleMassKg: text(metric.muscleMassKg),
    visceralFatLevel: text(metric.visceralFatLevel),
    bodyFatKg: text(metric.bodyFatKg),
    leanMassKg: text(metric.leanMassKg),
    bmrKcal: text(metric.importedBmrKcal),
    totalBodyWaterL: '',
  }
}

import { z } from 'zod'

const metric = (maximum: number) => z.number().finite().min(0).max(maximum).nullable()
export const tanitaMeasurementSchema = z.object({
  deviceModel: z.literal('BC-601'),
  date: z.string().date(), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/),
  measuredAt: z.string().datetime(), sourceTimestamp: z.string().datetime({ offset: true }),
  timeZone: z.literal('Europe/Istanbul'),
  ageReferenceYears: metric(130), heightCm: z.number().positive().max(300), weightKg: z.number().positive().max(500),
  importedBmi: metric(200), bodyFatPct: metric(100), muscleMassKg: metric(300), boneMassKg: metric(100),
  visceralFatLevel: metric(60), metabolicAgeYears: metric(150), dailyCalorieIntakeKcal: metric(15000), bodyWaterPct: metric(100),
  bodyFatKg: metric(300), leanMassKg: metric(300), importedBmrKcal: metric(15000),
  segmentalFat: z.object({ rightArmPct: metric(100), leftArmPct: metric(100), rightLegPct: metric(100), leftLegPct: metric(100), trunkPct: metric(100) }).strict(),
  segmentalMuscle: z.object({ rightArmKg: metric(100), leftArmKg: metric(100), rightLegKg: metric(150), leftLegKg: metric(150), trunkKg: metric(300) }).strict(),
  unknownRawValues: z.record(z.string().max(1000)).refine((values) => Object.keys(values).length <= 128),
  deviceStatus: z.string().max(100).nullable(),
}).strict()

export const measurementDeviceImportSchema = z.object({
  source: z.literal('tanita'), deviceModel: z.literal('BC-601'), sourceFormat: z.enum(['csv', 'pdf']),
  parserVersion: z.literal('tanita-bc601/1'),
  sourceTimestamp: z.string().datetime({ offset: true }),
  rawHash: z.string().regex(/^[a-f0-9]{64}$/), fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  normalizedPayload: tanitaMeasurementSchema,
}).strict().superRefine((value, ctx) => {
  if (value.sourceTimestamp !== value.normalizedPayload.sourceTimestamp || new Date(value.sourceTimestamp).toISOString() !== value.normalizedPayload.measuredAt) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Cihaz ölçüm zamanı tutarsız.' })
  }
  if (value.sourceTimestamp !== `${value.normalizedPayload.date}T${value.normalizedPayload.time}+03:00`) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Cihaz tarih ve saati tutarsız.' })
  }
  if (value.sourceFormat === 'csv' && value.normalizedPayload.importedBmrKcal !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Tanita CSV günlük kalori değeri BMR değildir.' })
  }
})
export type TanitaMeasurementImport = z.infer<typeof tanitaMeasurementSchema>
export type MeasurementDeviceImport = z.infer<typeof measurementDeviceImportSchema>
export const TANITA_DUPLICATE_MESSAGE = 'Bu Tanita ölçümü daha önce içe aktarılmış.'

/** Stable semantic identity: whitespace/quoting and unknown transport metadata do not create a new measurement. */
export function tanitaFingerprintInput(value: TanitaMeasurementImport): string {
  const { unknownRawValues: _unknown, deviceStatus: _status, ...metrics } = tanitaMeasurementSchema.parse(value)
  return JSON.stringify(metrics)
}

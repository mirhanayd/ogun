import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseTanitaCsv } from './parse-csv'
import { parseTanitaPdf } from './parse-pdf'
import { measurementDeviceImportSchema } from '@ogun/db/measurement-device-import'

const csv = readFileSync(new URL('./fixtures/Başlıksız.csv', import.meta.url), 'utf8')
describe('actual BC-601 CSV export', () => {
  it('preserves every supplied exact clinical field, case and semantic unit', async () => {
    const [item] = await parseTanitaCsv(csv)
    expect(item?.normalizedPayload).toEqual({
      deviceModel: 'BC-601', date: '2026-08-24', time: '13:58:41', measuredAt: '2026-08-24T10:58:41.000Z', sourceTimestamp: '2026-08-24T13:58:41+03:00', timeZone: 'Europe/Istanbul',
      ageReferenceYears: 41, heightCm: 169, weightKg: 86.6, importedBmi: 30.3, bodyFatPct: 44.2, muscleMassKg: 45.9, boneMassKg: 2.5, visceralFatLevel: 9, dailyCalorieIntakeKcal: 2349, metabolicAgeYears: 56, bodyWaterPct: 41.6,
      bodyFatKg: null, leanMassKg: null, importedBmrKcal: null,
      segmentalFat: { rightArmPct: 44.7, leftArmPct: 45, rightLegPct: 44.7, leftLegPct: 44.4, trunkPct: 43.8 },
      segmentalMuscle: { rightArmKg: 2.3, leftArmKg: 2.4, rightLegKg: 7.8, leftLegKg: 7.8, trunkKg: 25.6 },
      deviceStatus: 'E0', unknownRawValues: { '0': '16', '~0': '2', '~1': '2', '~2': '3', '~3': '4', Bt: '0', GE: '2', AL: '1' },
    })
    expect(item).toMatchObject({ source: 'tanita', sourceFormat: 'csv', parserVersion: 'tanita-bc601/1', rawHash: expect.stringMatching(/^[a-f0-9]{64}$/) })
    expect(item?.normalizedPayload).not.toHaveProperty('totalBodyWaterL')
    expect(item?.normalizedPayload).not.toHaveProperty('bmrKcal')
  })
  it('accepts the closed-brace variant and quoted commas/doubled quotes', async () => {
    const input = csv.trim() + ',Xx,"quoted, ""value"""}'
    const [item] = await parseTanitaCsv(input)
    expect(item?.normalizedPayload.unknownRawValues.Xx).toBe('quoted, "value"')
  })
  it('keeps mr/mR and ml/mL distinct', async () => {
    const [item] = await parseTanitaCsv(csv.replace('mR,7.8', 'mR,8.9').replace('ml,2.4', 'ml,1.9'))
    expect(item?.normalizedPayload.segmentalMuscle).toMatchObject({ rightArmKg: 2.3, rightLegKg: 8.9, leftArmKg: 1.9, leftLegKg: 7.8 })
  })
  it.each([
    ['missing Wk', csv.replace('Wk,86.6,', ''), 'Wk'],
    ['malformed braces', csv.replace('{0', '{{0'), 'sınır'],
    ['truncated record', csv.replace(',CS,E0', ''), 'sınır'],
    ['missing opener', csv.slice(1), 'sınır'],
    ['invalid day', csv.replace('24/08/2026', '31/02/2026'), 'tarih'],
    ['unsupported model', csv.replace('BC-601', 'RD-545'), 'Desteklenmeyen'],
    ['duplicate key', csv.replace('Wk,86.6', 'Wk,86.6,Wk,80'), 'tekrarlanan'],
  ])('rejects %s', async (_case, input, message) => { await expect(parseTanitaCsv(input)).rejects.toThrow(message) })
  it('returns selectable rows newest first, with stable fingerprints for duplicate detection', async () => {
    const rows = await parseTanitaCsv(`${csv.trim()}\n${csv.trim().replace('24/08/2026', '25/08/2026')}`)
    expect(rows).toHaveLength(2)
    expect(rows[0]?.normalizedPayload.date).toBe('2026-08-25')
    const [repeated] = await parseTanitaCsv(csv.trim() + '}')
    expect(rows[1]?.fingerprint).toBe(repeated?.fingerprint)
    expect(rows[0]?.fingerprint).not.toBe(repeated?.fingerprint)
  })
  it('rejects a forged CSV BMR mapping at the shared persistence boundary', async () => {
    const [item] = await parseTanitaCsv(csv)
    expect(measurementDeviceImportSchema.safeParse({ ...item, normalizedPayload: { ...item!.normalizedPayload, importedBmrKcal: 2349 } }).success).toBe(false)
  })
})
describe('actual text-layer TARTI BC-601 PDF', () => {
  it('reads the real report deterministically without OCR or uploads', async () => {
    const rows = await parseTanitaPdf(new Uint8Array(readFileSync(new URL('./fixtures/tanita.pdf', import.meta.url))))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ sourceFormat: 'pdf', normalizedPayload: {
      date: '2026-08-24', time: '12:27:16', heightCm: 163, weightKg: 57.8, importedBmi: 21.8,
      bodyFatPct: 34.2, muscleMassKg: 36.1, importedBmrKcal: 1888, bodyWaterPct: 48.41,
      boneMassKg: null, dailyCalorieIntakeKcal: null, metabolicAgeYears: 28, visceralFatLevel: 3,
      segmentalFat: { rightArmPct: 37.2, leftArmPct: 37, rightLegPct: 34.4, leftLegPct: 34.4, trunkPct: 33.6 },
      segmentalMuscle: { rightArmKg: 1.5, leftArmKg: 1.6, rightLegKg: 6.6, leftLegKg: 6.4, trunkKg: 20 },
      unknownRawValues: { mineralKg: '2.78', bodyWaterKg: '27.98' },
    } })
  }, 15_000)
})

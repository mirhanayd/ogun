import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { measurementFormInput } from '@/lib/measurement-input'
import { MEASUREMENT_FORM_DEFAULT_VALUES } from '@/lib/validation/measurement-schemas'
import { tanitaFormValues } from './form-values'
import { parseTanitaCsv } from './parse-csv'

const csv = readFileSync(new URL('./fixtures/Başlıksız.csv', import.meta.url), 'utf8')

describe('Tanita shared measurement form mapping', () => {
  it('fills canonical fields while preserving device-only metric semantics and time', async () => {
    const [deviceImport] = await parseTanitaCsv(csv)
    expect(deviceImport).toBeDefined()

    const values = tanitaFormValues(MEASUREMENT_FORM_DEFAULT_VALUES, deviceImport!)
    expect(values).toMatchObject({
      source: 'tanita',
      measuredAt: '2026-08-24',
      measuredTime: '13:58:41',
      heightCm: '169',
      weightKg: '86.6',
      bodyFatPct: '44.2',
      muscleMassKg: '45.9',
      visceralFatLevel: '9',
      bmrKcal: '',
      totalBodyWaterL: '',
    })

    const input = measurementFormInput(values)
    expect(input.measuredAt.toISOString()).toBe('2026-08-24T10:58:41.000Z')
    expect(input.deviceImport).toEqual(deviceImport)
    expect(input.bmrKcal).toBeNull()
    expect(input.totalBodyWaterL).toBeNull()
  })

  it('saves reviewed canonical edits without rewriting the original provenance', async () => {
    const [deviceImport] = await parseTanitaCsv(csv)
    const values = tanitaFormValues(MEASUREMENT_FORM_DEFAULT_VALUES, deviceImport!)
    const input = measurementFormInput({ ...values, weightKg: '86.4' })

    expect(input.weightKg).toBe(86.4)
    expect(input.deviceImport?.normalizedPayload.weightKg).toBe(86.6)
  })
})

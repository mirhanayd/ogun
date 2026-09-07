import Papa from 'papaparse'
import { measurementDeviceImportSchema, tanitaMeasurementSchema, tanitaFingerprintInput, type TanitaMeasurementImport, type MeasurementDeviceImport } from '@ogun/db/measurement-device-import'

export const TANITA_MAX_FILE_BYTES = 2 * 1024 * 1024
export async function sha256(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
export async function deviceImport(normalizedPayload: TanitaMeasurementImport, sourceFormat: 'csv' | 'pdf', rawHash: string): Promise<MeasurementDeviceImport> {
  return measurementDeviceImportSchema.parse({ source: 'tanita', deviceModel: normalizedPayload.deviceModel, sourceFormat, parserVersion: 'tanita-bc601/1', sourceTimestamp: normalizedPayload.sourceTimestamp, rawHash, fingerprint: await sha256(tanitaFingerprintInput(normalizedPayload)), normalizedPayload })
}

export function tanitaTimestamp(date: string, time: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(time)) throw new Error('Tanita ölçüm tarihi veya saati geçersiz.')
  const utc = new Date(`${date}T${time}Z`)
  if (!Number.isFinite(utc.getTime()) || utc.toISOString().slice(0, 10) !== date) throw new Error('Tanita ölçüm tarihi geçersiz.')
  const sourceTimestamp = `${date}T${time}+03:00`
  return { date, time, sourceTimestamp, measuredAt: new Date(sourceTimestamp).toISOString(), timeZone: 'Europe/Istanbul' as const }
}

export async function parseTanitaCsv(text: string): Promise<MeasurementDeviceImport[]> {
  if (new TextEncoder().encode(text).length > TANITA_MAX_FILE_BYTES) throw new Error('Tanita dosyası en fazla 2 MB olabilir.')
  // Frame records outside quoted values, then remove the protocol wrapper
  // BEFORE CSV tokenization (a trailing } after a quoted value is not CSV).
  const records: string[] = []
  let start = 0, quoted = false
  const input = text.replace(/^\uFEFF/, '')
  for (let index = 0; index < input.length; index += 1) {
    if (input[index] === '"') {
      if (quoted && input[index + 1] === '"') index += 1
      else quoted = !quoted
    } else if (!quoted && /[\r\n]/.test(input[index]!)) {
      if (input.slice(start, index).trim()) records.push(input.slice(start, index).trim())
      start = index + 1
    }
  }
  if (input.slice(start).trim()) records.push(input.slice(start).trim())
  if (quoted || !records.length || records.length > 1000) throw new Error('Tanita CSV biçimi geçersiz.')
  const imports: MeasurementDeviceImport[] = []
  const sourceHash = await sha256(text)
  for (const record of records) {
    const opens = record.startsWith('{'), closes = record.endsWith('}')
    if (!opens || record.startsWith('{{')) throw new Error('Tanita CSV kayıt sınırları geçersiz.')
    const result = Papa.parse<string[]>(record.slice(1, closes ? -1 : undefined), { delimiter: ',', header: false, dynamicTyping: false })
    if (result.errors.length || result.data.length !== 1) throw new Error('Tanita CSV biçimi geçersiz.')
    const rawRow = result.data[0]!
    const row = rawRow.map((value) => value.trim())
    // The actual BC-601 export supplied by the user starts with {0,16 and
    // terminates at CS,E0 without a closing brace. Accept that documented
    // transport variant only when the complete trailer is present.
    if (!closes && !(row[0] === '0' && row[1] === '16' && row.at(-2) === 'CS' && /^E\d+$/.test(row.at(-1) ?? ''))) throw new Error('Tanita CSV kayıt sınırları geçersiz.')
    if (row.some((value) => /[{}]/.test(value)) || row.length % 2 !== 0) throw new Error('Tanita CSV anahtar/değer çiftleri geçersiz.')
    const entries: Array<[string, string]> = []
    for (let index = 0; index < row.length; index += 2) {
      const key = row[index]!
      if (!key || entries.some(([existing]) => existing === key)) throw new Error('Tanita CSV tekrarlanan veya boş anahtar içeriyor.')
      entries.push([key, row[index + 1]!])
    }
    const values = Object.fromEntries(entries)
    if (values.MO !== 'BC-601') throw new Error('Desteklenmeyen Tanita cihaz modeli. BC-601 dosyası seçin.')
    const number = (key: string, required = false): number | null => {
      const raw = values[key]
      if (raw === undefined || raw === '') { if (required) throw new Error(`Tanita ${key} alanı eksik.`); return null }
      if (!/^-?\d+(?:\.\d+)?$/.test(raw)) throw new Error(`Tanita ${key} sayısal değeri geçersiz.`)
      return Number(raw)
    }
    const dateParts = values.DT?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    if (!dateParts) throw new Error('Tanita DT tarih alanı geçersiz.')
    const known = new Set(['MO','DT','Ti','AG','Hm','Wk','MI','FW','Fr','Fl','FR','FL','FT','mW','mr','ml','mR','mL','mT','bW','IF','rD','rA','ww','CS'])
    const normalized = tanitaMeasurementSchema.parse({
      deviceModel: 'BC-601', ...tanitaTimestamp(`${dateParts[3]}-${dateParts[2]}-${dateParts[1]}`, values.Ti ?? ''),
      ageReferenceYears: number('AG'), heightCm: number('Hm', true), weightKg: number('Wk', true), importedBmi: number('MI'),
      bodyFatPct: number('FW'), muscleMassKg: number('mW'), boneMassKg: number('bW'), visceralFatLevel: number('IF'), metabolicAgeYears: number('rA'), dailyCalorieIntakeKcal: number('rD'), bodyWaterPct: number('ww'),
      bodyFatKg: null, leanMassKg: null, importedBmrKcal: null,
      segmentalFat: { rightArmPct: number('Fr'), leftArmPct: number('Fl'), rightLegPct: number('FR'), leftLegPct: number('FL'), trunkPct: number('FT') },
      segmentalMuscle: { rightArmKg: number('mr'), leftArmKg: number('ml'), rightLegKg: number('mR'), leftLegKg: number('mL'), trunkKg: number('mT') },
      unknownRawValues: Object.fromEntries(entries.filter(([key]) => !known.has(key))), deviceStatus: values.CS ?? null,
    })
    imports.push(await deviceImport(normalized, 'csv', sourceHash))
  }
  return imports.sort((a, b) => b.sourceTimestamp.localeCompare(a.sourceTimestamp))
}

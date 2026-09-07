import { tanitaMeasurementSchema, type MeasurementDeviceImport } from '@ogun/db/measurement-device-import'
import { deviceImport, sha256, tanitaTimestamp, TANITA_MAX_FILE_BYTES } from './parse-csv'

export interface TanitaPdfTextItem { text: string; x: number; y: number }

// This parser is specific to the supplied TARTI BC-601 text-layer report.
// Match labels and column positions, never chart values or reference ranges.
export function parseTanitaPdfPage(items: TanitaPdfTextItem[]) {
  const meaningful = items.filter((item) => item.text.trim()).map((item) => ({ ...item, text: item.text.trim() }))
  if (!meaningful.some((item) => /^BC-601 SEGMENTAL VÜCUT ANALİZİ$/.test(item.text))) throw new Error('Desteklenmeyen Tanita PDF rapor düzeni.')
  const label = (text: string) => {
    const item = meaningful.find((item) => item.text === text)
    if (!item) throw new Error(`Tanita PDF alanı bulunamadı: ${text}`)
    return item
  }
  const right = (text: string) => {
    const item = label(text)
    const value = meaningful.filter((other) => Math.abs(other.y - item.y) < 1 && other.x > item.x + 1).sort((a, b) => a.x - b.x).find((item) => /^-?[\d]/.test(item.text))
    if (!value) throw new Error(`Tanita PDF değeri bulunamadı: ${text}`)
    return value.text
  }
  const below = (text: string) => {
    const item = label(text)
    const value = meaningful.filter((other) => item.y - other.y > 5 && item.y - other.y < 25 && Math.abs(item.x - other.x) < 20 && /^\d/.test(other.text)).sort((a, b) => Math.abs(a.x - item.x) - Math.abs(b.x - item.x))[0]
    if (!value) throw new Error(`Tanita PDF tablo değeri bulunamadı: ${text}`)
    return value.text
  }
  const numeric = (text: string) => {
    const token = text.match(/^-?\d[\d,]*(?:\.\d+)?/)?.[0]
    if (!token) throw new Error('Tanita PDF sayısal değeri geçersiz.')
    return Number(token.replace(/,/g, ''))
  }
  const pct = (text: string) => {
    const match = text.match(/\/\s*(\d+(?:\.\d+)?)%/)
    if (!match) throw new Error('Tanita PDF yüzde değeri bulunamadı.')
    return Number(match[1])
  }
  const segment = (rowLabel: string, columnLabel: string) => {
    const row = label(rowLabel), column = label(columnLabel)
    const value = meaningful.find((item) => Math.abs(item.y - row.y) < 1 && Math.abs(item.x - column.x) < 2 && /^\d/.test(item.text))
    if (!value) throw new Error('Tanita PDF segmental tablo eksik veya desteklenmiyor.')
    return numeric(value.text)
  }
  const timestamp = meaningful.find((item) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(item.text))?.text
  if (!timestamp) throw new Error('Tanita PDF ölçüm zamanı bulunamadı.')
  const fat = right('Yağ'), muscle = right('Kas'), water = right('Sıvı')
  return tanitaMeasurementSchema.parse({
    deviceModel: 'BC-601', ...tanitaTimestamp(timestamp.slice(0, 10), timestamp.slice(11)),
    ageReferenceYears: numeric(below('Yaş')), heightCm: numeric(below('Boy (cm)')), weightKg: numeric(below('Kilo (kg)')), importedBmi: numeric(below('BMI')),
    bodyFatPct: pct(fat), bodyFatKg: numeric(fat), leanMassKg: numeric(right('Yağsız Kütle')), muscleMassKg: numeric(muscle),
    // The PDF explicitly labels BMR; CSV rD is not used here. Mineral is not
    // inferred to mean bone mass, and fluid mass is not inferred to be liters.
    importedBmrKcal: numeric(right('Bazal Metabolizma Hızı')), boneMassKg: null, dailyCalorieIntakeKcal: null,
    visceralFatLevel: numeric(right('İç Yağlanma')), metabolicAgeYears: numeric(right('Metabolik Yaş')), bodyWaterPct: pct(water),
    segmentalFat: { rightArmPct: segment('Yağ Oranı (%)', 'Sağ Kol'), leftArmPct: segment('Yağ Oranı (%)', 'Sol Kol'), rightLegPct: segment('Yağ Oranı (%)', 'Sağ Bacak'), leftLegPct: segment('Yağ Oranı (%)', 'Sol Bacak'), trunkPct: segment('Yağ Oranı (%)', 'Gövde') },
    segmentalMuscle: { rightArmKg: segment('Kas (kg)', 'Sağ Kol'), leftArmKg: segment('Kas (kg)', 'Sol Kol'), rightLegKg: segment('Kas (kg)', 'Sağ Bacak'), leftLegKg: segment('Kas (kg)', 'Sol Bacak'), trunkKg: segment('Kas (kg)', 'Gövde') },
    unknownRawValues: {
      mineralKg: String(numeric(right('Mineral'))), bodyWaterKg: String(numeric(water)), proteinKg: String(numeric(right('Protein'))), waistCm: String(numeric(right('Bel (cm)'))),
      rightArmFatKg: String(segment('Yağ (kg)', 'Sağ Kol')), leftArmFatKg: String(segment('Yağ (kg)', 'Sol Kol')), rightLegFatKg: String(segment('Yağ (kg)', 'Sağ Bacak')), leftLegFatKg: String(segment('Yağ (kg)', 'Sol Bacak')), trunkFatKg: String(segment('Yağ (kg)', 'Gövde')),
    }, deviceStatus: null,
  })
}

export async function parseTanitaPdf(data: Uint8Array): Promise<MeasurementDeviceImport[]> {
  if (data.length > TANITA_MAX_FILE_BYTES) throw new Error('Tanita dosyası en fazla 2 MB olabilir.')
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  if (typeof window !== 'undefined') pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString()
  const rawHash = await sha256(data)
  const task = pdfjs.getDocument({ data: new Uint8Array(data), useSystemFonts: true, useWorkerFetch: false })
  try {
    const document = await task.promise
    if (document.numPages > 20) throw new Error('Tanita PDF en fazla 20 sayfa olabilir.')
    const imports: MeasurementDeviceImport[] = []
    for (let number = 1; number <= document.numPages; number += 1) {
      const page = await document.getPage(number)
      const content = await page.getTextContent()
      const items = content.items.flatMap((item) => 'str' in item ? [{ text: item.str, x: item.transform[4]!, y: item.transform[5]! }] : [])
      if (items.some((item) => item.text.includes('BC-601 SEGMENTAL'))) imports.push(await deviceImport(parseTanitaPdfPage(items), 'pdf', rawHash))
    }
    if (!imports.length) throw new Error('Desteklenen metin katmanlı BC-601 raporu bulunamadı. Görüntü tabanlı PDF için CSV dosyasını kullanın.')
    return imports.sort((a, b) => b.sourceTimestamp.localeCompare(a.sourceTimestamp))
  } finally { await task.destroy() }
}

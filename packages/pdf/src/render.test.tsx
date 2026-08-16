// GitHub issue #35 / Prompt 6.1 — VERİFİKASYON kuralı: "Gerçek bir PDF
// render et... sadece JSX'i typecheck etme, gerçekten render ettiğini
// KANITLA." Bu test dosyası react-pdf'in Node-tarafı renderToBuffer API'sini
// (bkz. render.tsx) vitest içinde, TARAYICI OLMADAN çağırır ve üretilen
// Buffer'ın (a) gerçek bir PDF imzasıyla başladığını, (b) anlamlı bir
// boyutta olduğunu doğrular.
import { describe, expect, it } from 'vitest'
import { renderPlanPdfBuffer } from './render'
import type { PdfPlanData } from './types'

function basePlanData(overrides: Partial<PdfPlanData> = {}): PdfPlanData {
  return {
    clinic: {
      name: 'Ogun Diyet Kliniği',
      logoDataUri: null,
      primaryColor: '#16a34a',
      phone: '+90 555 000 00 00',
      address: 'Girne, KKTC',
    },
    clientName: 'Ayşe Öztürk',
    dietitianName: 'Dyt. Şule Çelik',
    planName: 'Kilo Verme Planı — Hafta 1',
    generatedAt: '2026-08-16T10:00:00.000Z',
    startDate: '2026-08-17T00:00:00.000Z',
    endDate: '2026-08-23T00:00:00.000Z',
    days: [
      {
        id: 'day-1',
        label: 'Gün 1',
        meals: [
          {
            id: 'meal-1',
            name: 'Kahvaltı',
            time: '08:00',
            totalKcal: 350,
            items: [
              {
                id: 'item-1',
                name: 'Yulaf ezmesi',
                amountText: '50 g',
                kcal: 190,
                isOptional: false,
                note: 'Şekersiz',
                alternatives: [
                  { id: 'alt-1', name: 'Tam buğday ekmeği', amountText: '2 dilim', kcal: 160 },
                ],
              },
              {
                id: 'item-2',
                name: 'Süt (yarım yağlı)',
                amountText: '200 ml',
                kcal: 90,
                isOptional: true,
                note: null,
                alternatives: [],
              },
            ],
          },
        ],
      },
    ],
    generalInstructions: 'Bol su için, öğünleri atlamayın.',
    waterIntakeReminder: 'Günde en az 2000 ml su tüketiniz.',
    nextAppointmentText: null,
    exchangeEquivalents: null,
    nutrientSummary: null,
    layout: { density: 'spacious', showCalories: true, format: 'besin_listesi', includeNutrientSummaryPage: false },
    ...overrides,
  }
}

// %PDF- ile başlayan gerçek bir PDF dosya imzası (magic bytes).
const PDF_MAGIC = '%PDF-'

describe('renderPlanPdfBuffer', () => {
  it('gerçek bir PDF üretir (magic bytes + anlamlı boyut)', async () => {
    const buffer = await renderPlanPdfBuffer(basePlanData())
    expect(Buffer.isBuffer(buffer)).toBe(true)
    expect(buffer.subarray(0, 5).toString('ascii')).toBe(PDF_MAGIC)
    // react-pdf gömülen fontu SADECE kullanılan glif altkümesine indirger
    // (subsetting) — bu yüzden birkaç yüz KB değil, birkaç KB'lık bir alt
    // küme + PDF nesne grafiği beklenir. Eşik, "boş/bozuk bir çıktı"
    // (birkaç yüz bayt) ile "gerçek, glif-gömülü bir PDF" (>10 KB) arasını
    // ayırt edecek şekilde seçildi.
    expect(buffer.byteLength).toBeGreaterThan(10_000)
  })

  it('Türkçe karakterleri (ı, ş, ğ, ü, ö, ç, İ) içeren içerikle render edilebilir', async () => {
    const data = basePlanData({
      clientName: 'Gökçe Şahin İnönü',
      generalInstructions: 'Öğünler arası açlık hissi olursa çiğ badem tüketebilirsiniz.',
    })
    const buffer = await renderPlanPdfBuffer(data)
    expect(buffer.subarray(0, 5).toString('ascii')).toBe(PDF_MAGIC)
  })

  it('kompakt yoğunlukta da geçerli bir PDF üretir', async () => {
    const data = basePlanData({
      layout: { density: 'compact', showCalories: true, format: 'besin_listesi', includeNutrientSummaryPage: false },
    })
    const buffer = await renderPlanPdfBuffer(data)
    expect(buffer.subarray(0, 5).toString('ascii')).toBe(PDF_MAGIC)
  })

  it('showCalories=false olduğunda da render edilir (kalori bastırılır, hata vermez)', async () => {
    const data = basePlanData({
      layout: { density: 'spacious', showCalories: false, format: 'besin_listesi', includeNutrientSummaryPage: false },
    })
    const buffer = await renderPlanPdfBuffer(data)
    expect(buffer.subarray(0, 5).toString('ascii')).toBe(PDF_MAGIC)
  })

  it('besin öğesi özeti sayfası açıkken (includeNutrientSummaryPage) ek sayfa içeren daha büyük bir PDF üretir', async () => {
    const withoutSummary = await renderPlanPdfBuffer(basePlanData())
    const withSummary = await renderPlanPdfBuffer(
      basePlanData({
        layout: {
          density: 'spacious',
          showCalories: true,
          format: 'besin_listesi',
          includeNutrientSummaryPage: true,
        },
        nutrientSummary: {
          totalKcal: 1850,
          targetKcal: 1800,
          macroDistribution: { proteinPercent: 25, carbPercent: 45, fatPercent: 30 },
          nutrients: [
            { nameTr: 'C Vitamini', unit: 'mg', actualValue: 65, percentOfReference: 72, band: 'adequate' },
            { nameTr: 'Demir', unit: 'mg', actualValue: 9, percentOfReference: 50, band: 'low' },
          ],
          warnings: ['Demir alımı referansın altında.'],
        },
      }),
    )
    expect(withSummary.byteLength).toBeGreaterThan(withoutSummary.byteLength)
  })

  it('değişim_listesi formatında grup eşdeğerleri tablosu sayfasını içerir', async () => {
    const withoutExchange = await renderPlanPdfBuffer(basePlanData())
    const withExchange = await renderPlanPdfBuffer(
      basePlanData({
        layout: {
          density: 'spacious',
          showCalories: true,
          format: 'değişim_listesi',
          includeNutrientSummaryPage: false,
        },
        exchangeEquivalents: [
          {
            groupCode: 'EKMEK',
            headerText: '1 ekmek değişimi =',
            equivalents: [
              { foodNameTr: 'ekmek', gramText: '25 g ekmek', portionText: '1 dilim ekmek' },
              { foodNameTr: 'pirinç pilavı', gramText: '20 g pirinç pilavı', portionText: null },
            ],
          },
        ],
      }),
    )
    expect(withExchange.byteLength).toBeGreaterThan(withoutExchange.byteLength)
  })

  it('geçersiz veri (Zod şemasına uymayan) reddedilir', async () => {
    // @ts-expect-error kasıtlı olarak geçersiz — layout.format şemada
    // tanımlı iki değerden biri DEĞİL.
    const invalid: PdfPlanData = basePlanData({ layout: { ...basePlanData().layout, format: 'geçersiz' } })
    await expect(renderPlanPdfBuffer(invalid)).rejects.toThrow()
  })
})

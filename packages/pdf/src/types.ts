// GitHub issue #35 / Prompt 6.1 — "PDF üretimi". Bu dosya, gerçek PDF
// bileşenlerinin (bkz. components/DietPlanDocument.tsx) TEK girdi şeklini
// tanımlar: PdfPlanData. Bu paket (packages/pdf) BİLEREK DB'ye bağımlı
// DEĞİL — nutrition-core'un genel kuralıyla AYNI gerekçe (bkz. o paketin
// dosya başı notları): çağıran taraf (apps/web) plan_tree + foods/recipes/
// clinics/clients tablolarını okuyup burada tanımlı ŞEKLE dönüştürür (bkz.
// apps/web/src/lib/pdf/resolve-plan-pdf-data.ts). Bu ayrım, packages/pdf'in
// hem tarayıcıda (istemci önizlemesi) hem düz bir Node sürecinde (sunucu
// tarafı üretim, #36'nın paylaşım linkine devredeceği Buffer/stream) HİÇBİR
// DB/Next.js bağımlılığı olmadan çalışabilmesini sağlar (mimari kural #3).
//
// KURAL: `any` YOK — her alan Zod'dan türetilir (mimari kural #2).
import { z } from 'zod'

export const pdfMealItemSchema = z.object({
  id: z.string(),
  // Görüntülenecek ad — besin/tarif/serbest metin adı çağıran tarafça
  // ÖNCEDEN çözülmüş olarak gelir (bkz. resolve-plan-pdf-data.ts) — bu
  // paket foodId/recipeId gibi DB kimliklerini HİÇ görmez.
  name: z.string(),
  amountText: z.string(), // "150 g" veya değişim modunda "2 ekmek değişimi"
  kcal: z.number().nullable(), // showCalories=false ise UI'da basılmaz ama veri yine taşınır
  isOptional: z.boolean(),
  note: z.string().nullable(),
  alternatives: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      amountText: z.string(),
      kcal: z.number().nullable(),
    }),
  ),
})
export type PdfMealItem = z.infer<typeof pdfMealItemSchema>

export const pdfMealSchema = z.object({
  id: z.string(),
  name: z.string(),
  time: z.string().nullable(),
  items: z.array(pdfMealItemSchema),
  totalKcal: z.number().nullable(),
})
export type PdfMeal = z.infer<typeof pdfMealSchema>

export const pdfDaySchema = z.object({
  id: z.string(),
  label: z.string(), // "Gün 1" veya day_label
  meals: z.array(pdfMealSchema),
})
export type PdfDay = z.infer<typeof pdfDaySchema>

// GitHub issue #28 / Prompt 5.6 — değişim formatının sonunda basılan grup
// eşdeğer tablosu. nutrition-core/src/exchange-equivalents.ts'in ÜRETTİĞİ
// GroupEquivalentsRow şekliyle BİREBİR aynı alanlar (o modülü TEKRAR
// tanımlamak yerine burada sadece yapısal olarak eşleniyor — packages/pdf
// nutrition-core'a bağımlı olabilir, tersi DEĞİL, bkz. package.json).
export const pdfExchangeEquivalentsRowSchema = z.object({
  groupCode: z.string(),
  headerText: z.string(),
  equivalents: z.array(
    z.object({
      foodNameTr: z.string(),
      gramText: z.string(),
      portionText: z.string().nullable(),
    }),
  ),
})
export type PdfExchangeEquivalentsRow = z.infer<typeof pdfExchangeEquivalentsRowSchema>

// Opsiyonel besin öğesi özeti sayfası (GÖREV: "Opsiyonel sayfa: nutrient
// summary"). #26'nın canlı panelinin SUNUCU tarafı eşdeğeri — aynı
// nutrition-core fonksiyonlarından (calculatePlan, classifyNutrientLevel,
// vb.) üretilir, burada sadece SONUÇ taşınır.
export const pdfNutrientSummarySchema = z.object({
  totalKcal: z.number(),
  targetKcal: z.number().nullable(),
  macroDistribution: z.object({
    proteinPercent: z.number(),
    carbPercent: z.number(),
    fatPercent: z.number(),
  }),
  nutrients: z.array(
    z.object({
      nameTr: z.string(),
      unit: z.string(),
      actualValue: z.number(),
      percentOfReference: z.number().nullable(),
      band: z.enum(['low', 'adequate', 'optimal', 'excessive', 'no_reference']),
    }),
  ),
  warnings: z.array(z.string()),
})
export type PdfNutrientSummary = z.infer<typeof pdfNutrientSummarySchema>

export const pdfLayoutOptionsSchema = z.object({
  // GÖREV "Template seçenekleri": Kompakt/geniş düzen.
  density: z.enum(['compact', 'spacious']).default('spacious'),
  // Kalori gösterme/gizleme — bazı diyetisyenler danışana kalori sayısı
  // göstermek istemiyor (GÖREV metni).
  showCalories: z.boolean().default(true),
  // GitHub issue #28 — plan_output_format ile BİREBİR aynı iki değer.
  format: z.enum(['besin_listesi', 'değişim_listesi']).default('besin_listesi'),
  includeNutrientSummaryPage: z.boolean().default(false),
})
export type PdfLayoutOptions = z.infer<typeof pdfLayoutOptionsSchema>

export const pdfClinicBrandingSchema = z.object({
  name: z.string(),
  logoDataUri: z.string().nullable(), // önceden base64 data URI'ye çevrilmiş (bkz. resolve-plan-pdf-data.ts)
  primaryColor: z.string().nullable(), // "#16a34a" gibi — yoksa varsayılan marka rengi kullanılır
  phone: z.string().nullable(),
  address: z.string().nullable(),
})
export type PdfClinicBranding = z.infer<typeof pdfClinicBrandingSchema>

export const pdfPlanDataSchema = z.object({
  clinic: pdfClinicBrandingSchema,
  clientName: z.string(),
  dietitianName: z.string().nullable(),
  planName: z.string(),
  generatedAt: z.string(), // ISO — biçimlendirme (tr-TR) render katmanının işi
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  days: z.array(pdfDaySchema),
  // GÖREV "Footer: genel öneriler, su tüketimi hatırlatması, bir sonraki
  // randevu". generalInstructions -> diet_plans.generalInstructions (#23'te
  // zaten var). waterIntakeReminder -> client_health.waterIntakeMl'den
  // türetilmiş bir metin (varsa). nextAppointmentText BİLEREK HER ZAMAN
  // null — roadmap'in kendi notu: randevu modülü bu repoda henüz YOK, bu
  // alan var OLAN bir veri kaynağına bağlanmadan sahte veri ÜRETİLMEDİ
  // (bkz. PR açıklaması). UI bu null'ı basitçe göstermez (opsiyonel bölüm).
  generalInstructions: z.string().nullable(),
  waterIntakeReminder: z.string().nullable(),
  nextAppointmentText: z.string().nullable(),
  exchangeEquivalents: z.array(pdfExchangeEquivalentsRowSchema).nullable(),
  nutrientSummary: pdfNutrientSummarySchema.nullable(),
  layout: pdfLayoutOptionsSchema,
})
export type PdfPlanData = z.infer<typeof pdfPlanDataSchema>

import { z } from 'zod'
// TİP-ONLY içe aktarım — measurement-schemas.ts ile AYNI desen (bkz. o
// dosyanın başındaki not): drizzle-orm'u istemci paketine sürüklememek için
// değer listeleri burada elle tekrar tanımlanıyor.
import type { ActivityLevelValue } from '@ogun/db/schema'

// Anamnez formu (GitHub issue #19 / Prompt 4.3, GÖREV 1) — "sekmeli uzun
// form: sağlık geçmişi, ilaçlar, alerjiler, yaşam tarzı, beslenme
// alışkanlıkları (öğün sayısı, dışarıda yeme sıklığı, su tüketimi), fiziksel
// aktivite, uyku, sindirim. Otomatik kaydet (debounce 800ms)."
//
// TÜM alanlar BİLEREK opsiyonel: bu bir "kaydet" düğmesi olan bir form
// DEĞİL, autosave'li bir taslak — diyetisyen tek bir sekmeyi doldurup
// çıkabilmeli, hiçbir alan formun GÖNDERİLMESİNİ bloklamamalı (measurements
// formundaki weightKg zorunluluğuyla KARIŞTIRILMAMALI, o TEK seferlik bir
// "kaydet" eylemiydi).

export const ACTIVITY_LEVEL_OPTIONS: { value: ActivityLevelValue; label: string }[] = [
  { value: 'sedentary', label: 'Sedanter (hareketsiz)' },
  { value: 'light', label: 'Hafif aktif' },
  { value: 'moderate', label: 'Orta aktif' },
  { value: 'active', label: 'Aktif' },
  { value: 'very_active', label: 'Çok aktif' },
]
export const ACTIVITY_LEVEL_LABELS_TR: Record<ActivityLevelValue, string> = {
  sedentary: 'Sedanter (hareketsiz)',
  light: 'Hafif aktif',
  moderate: 'Orta aktif',
  active: 'Aktif',
  very_active: 'Çok aktif',
}

export const ALLERGEN_SEVERITY_OPTIONS: { value: 'hafif' | 'orta' | 'şiddetli'; label: string }[] =
  [
    { value: 'hafif', label: 'Hafif' },
    { value: 'orta', label: 'Orta' },
    { value: 'şiddetli', label: 'Şiddetli' },
  ]

// Besin alerjisi/intoleransı — GÖREV 1'in "plan editöründe kırmızı
// işaretlenecek" bağlantısı için normalize edilmiş liste girişi (bkz.
// schema/clients.ts ClientAllergenEntry). id istemci tarafında
// crypto.randomUUID() ile üretilir (satır sil/güncelle için stabil key).
export const allergenEntrySchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1, 'Besin adı boş olamaz.').max(120, 'Besin adı çok uzun.'),
  severity: z.enum(['hafif', 'orta', 'şiddetli']).nullable(),
  note: z.string().trim().max(500, 'Not çok uzun.').nullable(),
})
export type AllergenEntryFormValues = z.infer<typeof allergenEntrySchema>

function optionalIntegerField(min: number, max: number, label: string) {
  return z
    .string()
    .trim()
    .refine(
      (value) =>
        value === '' ||
        (Number.isInteger(Number(value)) && Number(value) >= min && Number(value) <= max),
      `${label} geçersiz.`,
    )
    .optional()
    .or(z.literal(''))
}

// listItemsFieldSchema — conditions/medications gibi serbest metin liste
// alanları için: tek bir textarea'da SATIR BAŞINA bir öğe (kullanıcı deneyimi
// açısından yapılandırılmış bir "chip ekle" arayüzünden daha hızlı — uzun
// bir ilaç/hastalık listesini yapıştırıp Enter'la ayırabilsin diye), form
// katmanında satırlara bölünüp trim edilir.
const freeTextListSchema = z
  .string()
  .trim()
  .max(4000, 'Bu alan çok uzun.')
  .optional()
  .or(z.literal(''))

export const conditionCatalogSelectionSchema = z.object({
  conditionId: z.string().min(1).max(160),
  nameTr: z.string().min(1).max(500),
  nameEn: z.string().max(500),
  sourceCode: z.string().min(1).max(160),
  isNeoplasm: z.boolean(),
  needsReview: z.boolean(),
})

export const medicationCatalogSelectionSchema = z
  .object({
    key: z.string().min(1).max(180),
    kind: z.enum(['product', 'substance']),
    medicationProductId: z.string().min(1).max(160).nullable(),
    medicationSubstanceId: z.string().min(1).max(160).nullable(),
    name: z.string().min(1).max(500),
    substanceNames: z.array(z.string().min(1).max(500)).max(20),
    barcode: z.string().max(32).nullable(),
    needsReview: z.boolean(),
  })
  .superRefine((selection, ctx) => {
    const validProduct =
      selection.kind === 'product' &&
      selection.medicationProductId &&
      !selection.medicationSubstanceId
    const validSubstance =
      selection.kind === 'substance' &&
      selection.medicationSubstanceId &&
      !selection.medicationProductId
    if (!validProduct && !validSubstance) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'İlaç katalog seçimi geçersiz.' })
    }
  })

export const anamnesisFormSchema = z.object({
  // --- Sağlık geçmişi ------------------------------------------------------
  conditions: freeTextListSchema,
  conditionSelections: z
    .array(conditionCatalogSelectionSchema)
    .max(100, 'En fazla 100 hastalık seçilebilir.'),
  familyHistory: z.string().trim().max(2000, 'Bu alan çok uzun.').optional().or(z.literal('')),
  surgeries: z.string().trim().max(2000, 'Bu alan çok uzun.').optional().or(z.literal('')),
  // --- İlaçlar ---------------------------------------------------------------
  medications: freeTextListSchema,
  medicationSelections: z
    .array(medicationCatalogSelectionSchema)
    .max(100, 'En fazla 100 ilaç seçilebilir.'),
  // --- Alerjiler ---------------------------------------------------------
  allergies: z.array(allergenEntrySchema).max(50, 'En fazla 50 kayıt eklenebilir.'),
  intolerances: z.array(allergenEntrySchema).max(50, 'En fazla 50 kayıt eklenebilir.'),
  // --- Yaşam tarzı ---------------------------------------------------------
  smokingStatus: z.string().trim().max(200, 'Bu alan çok uzun.').optional().or(z.literal('')),
  alcoholUse: z.string().trim().max(200, 'Bu alan çok uzun.').optional().or(z.literal('')),
  // --- Beslenme alışkanlıkları ----------------------------------------------
  mealsPerDay: optionalIntegerField(1, 15, 'Öğün sayısı'),
  eatingOutFrequency: z.string().trim().max(200, 'Bu alan çok uzun.').optional().or(z.literal('')),
  waterIntakeMl: optionalIntegerField(0, 10000, 'Su tüketimi'),
  // --- Fiziksel aktivite -----------------------------------------------------
  activityLevel: z.enum(['sedentary', 'light', 'moderate', 'active', 'very_active']).nullable(),
  activityNotes: z.string().trim().max(2000, 'Bu alan çok uzun.').optional().or(z.literal('')),
  // --- Uyku ------------------------------------------------------------------
  sleepHours: optionalIntegerField(0, 24, 'Uyku süresi'),
  sleepQuality: z.string().trim().max(200, 'Bu alan çok uzun.').optional().or(z.literal('')),
  // --- Sindirim --------------------------------------------------------------
  bowelHabits: z.string().trim().max(1000, 'Bu alan çok uzun.').optional().or(z.literal('')),
})
export type AnamnesisFormValues = z.infer<typeof anamnesisFormSchema>

export const ANAMNESIS_FORM_DEFAULT_VALUES: AnamnesisFormValues = {
  conditions: '',
  conditionSelections: [],
  familyHistory: '',
  surgeries: '',
  medications: '',
  medicationSelections: [],
  allergies: [],
  intolerances: [],
  smokingStatus: '',
  alcoholUse: '',
  mealsPerDay: '',
  eatingOutFrequency: '',
  waterIntakeMl: '',
  activityLevel: null,
  activityNotes: '',
  sleepHours: '',
  sleepQuality: '',
  bowelHabits: '',
}

// freeTextListSchema (textarea, satır başına bir öğe) <-> string[] (DB) dönüşümleri.
export function listFromText(text: string | undefined): string[] {
  if (!text) return []
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

export function textFromList(list: string[] | null | undefined): string {
  return (list ?? []).join('\n')
}

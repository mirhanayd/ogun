import { z } from 'zod'
// TİP-ONLY içe aktarım — client-schemas.ts/measurement-schemas.ts'teki AYNI
// desen (bkz. o dosyaların başındaki not): drizzle-orm'u istemci paketine
// sürüklememek için değer listeleri burada elle, DB değerleriyle birebir
// eşleşecek şekilde tekrar tanımlanıyor.
import type { PlanMealType, PlanStatus, PlanTemplateCategory, PlanType } from '@ogun/db/schema'

// GitHub issue #23 / Prompt 5.1 — plan şeması server action'larının Zod
// doğrulaması. Bu issue'da HENÜZ bir editör UI'ı YOK (bkz. app/(app)/planlar/
// page.tsx yer tutucusu) — bu yüzden aşağıdaki şemalar measurement-schemas.ts
// gibi <input> odaklı "hepsi string" form şemaları DEĞİL, actions.ts'in
// doğrudan (UI'sız, test'lerden de) çağrılabileceği YAPISAL (typed) girdi
// şemaları. #25 editör UI'ını yazdığında kendi form-özel string şemasını
// bunun üstüne (veya yanına) ekleyebilir.

// ---------------------------------------------------------------------------
// Sözlükler (UI etiketleri) — #25/#28'in editör/şablon ekranlarında
// doğrudan kullanılabilsin diye şimdiden hazırlanıyor.
// ---------------------------------------------------------------------------

export const PLAN_TYPE_OPTIONS: { value: PlanType; label: string }[] = [
  { value: 'günlük', label: 'Günlük' },
  { value: 'haftalık', label: 'Haftalık' },
  { value: 'değişim', label: 'Değişim listesi' },
]

export const PLAN_STATUS_LABELS_TR: Record<PlanStatus, string> = {
  taslak: 'Taslak',
  aktif: 'Aktif',
  arşiv: 'Arşiv',
}

export const PLAN_TEMPLATE_CATEGORY_OPTIONS: { value: PlanTemplateCategory; label: string }[] = [
  { value: 'diyabet', label: 'Diyabet' },
  { value: 'kilo_verme', label: 'Kilo verme' },
  { value: 'kilo_alma', label: 'Kilo alma' },
  { value: 'gebelik', label: 'Gebelik' },
  { value: 'sporcu', label: 'Sporcu' },
  { value: 'çölyak', label: 'Çölyak' },
  { value: 'böbrek', label: 'Böbrek' },
  { value: 'karaciğer', label: 'Karaciğer' },
  { value: 'genel', label: 'Genel' },
]

export const PLAN_MEAL_TYPE_OPTIONS: { value: PlanMealType; label: string }[] = [
  { value: 'kahvaltı', label: 'Kahvaltı' },
  { value: 'ara1', label: 'Ara öğün 1' },
  { value: 'öğle', label: 'Öğle' },
  { value: 'ara2', label: 'Ara öğün 2' },
  { value: 'akşam', label: 'Akşam' },
  { value: 'gece', label: 'Gece' },
]

// ---------------------------------------------------------------------------
// diet_plans — oluşturma / güncelleme
// ---------------------------------------------------------------------------

const isoDateTime = z
  .union([z.string(), z.date()])
  .transform((value) => (value instanceof Date ? value : new Date(value)))
  .refine((value) => !Number.isNaN(value.getTime()), 'Geçersiz tarih.')

export const planInputSchema = z.object({
  clientId: z.string().min(1).nullable().optional(),
  name: z.string().trim().min(1, 'Plan adı zorunludur.').max(200, 'Plan adı çok uzun.'),
  startDate: isoDateTime.nullable().optional(),
  endDate: isoDateTime.nullable().optional(),
  targetKcal: z.number().int().positive().max(10000).nullable().optional(),
  targetMacros: z.record(z.string(), z.number()).nullable().optional(),
  planType: z.enum(['günlük', 'haftalık', 'değişim']).optional(),
  status: z.enum(['taslak', 'aktif', 'arşiv']).optional(),
  isTemplate: z.boolean().optional(),
  templateCategory: z
    .enum([
      'diyabet',
      'kilo_verme',
      'kilo_alma',
      'gebelik',
      'sporcu',
      'çölyak',
      'böbrek',
      'karaciğer',
      'genel',
    ])
    .nullable()
    .optional(),
  notes: z.string().trim().max(4000, 'Notlar çok uzun.').nullable().optional(),
  generalInstructions: z
    .string()
    .trim()
    .max(4000, 'Genel talimatlar çok uzun.')
    .nullable()
    .optional(),
})
export type PlanInputValues = z.infer<typeof planInputSchema>

export const planUpdateSchema = planInputSchema.partial()
export type PlanUpdateValues = z.infer<typeof planUpdateSchema>

// ---------------------------------------------------------------------------
// plan_days / plan_meals
// ---------------------------------------------------------------------------

export const dayInputSchema = z.object({
  dayNumber: z.number().int().min(1).max(7),
  dayLabel: z.string().trim().max(50).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
})
export type DayInputValues = z.infer<typeof dayInputSchema>

export const mealInputSchema = z.object({
  mealType: z.enum(['kahvaltı', 'ara1', 'öğle', 'ara2', 'akşam', 'gece']),
  time: z
    .string()
    .trim()
    .refine(
      (value) => value === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(value),
      'Saat biçimi geçersiz (SS:DD).',
    )
    .nullable()
    .optional(),
  name: z.string().trim().min(1, 'Öğün adı zorunludur.').max(100),
  sortOrder: z.number().int().min(0).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
})
export type MealInputValues = z.infer<typeof mealInputSchema>

// GitHub issue #25 — bkz. packages/db/src/queries/plans.ts updateMeal
// üstündeki not: #23'te unutulan öğün düzenleme şeması.
export const mealUpdateSchema = z.object({
  name: z.string().trim().min(1, 'Öğün adı zorunludur.').max(100).optional(),
  time: z
    .string()
    .trim()
    .refine(
      (value) => value === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(value),
      'Saat biçimi geçersiz (SS:DD).',
    )
    .nullable()
    .optional(),
  sortOrder: z.number().int().min(0).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
})
export type MealUpdateValues = z.infer<typeof mealUpdateSchema>

// ---------------------------------------------------------------------------
// plan_items / plan_item_alternatives — GÖREV 1 CHECK kısıtının Zod
// karşılığı: foodId, recipeId, freeText'ten TAM OLARAK biri dolu olmalı.
// packages/db/src/queries/plans.ts assertExactlyOneSource ve schema/plans.ts
// DB CHECK kısıtıyla AYNI kural, üçüncü (en dıştaki, kullanıcı girdisine en
// yakın) katman.
// ---------------------------------------------------------------------------

function countFilled(values: (string | null | undefined)[]): number {
  return values.filter((value) => value !== null && value !== undefined && value.trim() !== '')
    .length
}

const planItemSourceSchema = z
  .object({
    foodId: z.string().min(1).nullable().optional(),
    recipeId: z.string().min(1).nullable().optional(),
    freeText: z.string().trim().min(1).max(500).nullable().optional(),
    amount: z.number().positive('Miktar 0dan büyük olmalıdır.').max(100000),
    portionId: z.string().min(1).nullable().optional(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .refine((data) => countFilled([data.foodId, data.recipeId, data.freeText]) === 1, {
    message: 'Bir kalem tam olarak bir besin, tarif veya serbest metin içermelidir.',
    path: ['foodId'],
  })

export const planItemInputSchema = planItemSourceSchema.and(
  z.object({
    isOptional: z.boolean().optional(),
    note: z.string().trim().max(1000).nullable().optional(),
  }),
)
export type PlanItemInputValues = z.infer<typeof planItemInputSchema>

// Update şemasında "kaynak alanlarından hiçbiri gönderilmediyse" kural
// atlanır (partial update — sadece amount/sortOrder değişebilir); en az bir
// kaynak alanı GÖNDERİLDİYSE aynı "tam bir tane" kuralı geçerli olur.
export const planItemUpdateSchema = z
  .object({
    foodId: z.string().min(1).nullable().optional(),
    recipeId: z.string().min(1).nullable().optional(),
    freeText: z.string().trim().min(1).max(500).nullable().optional(),
    amount: z.number().positive().max(100000).optional(),
    portionId: z.string().min(1).nullable().optional(),
    sortOrder: z.number().int().min(0).optional(),
    isOptional: z.boolean().optional(),
    note: z.string().trim().max(1000).nullable().optional(),
  })
  .refine(
    (data) => {
      const touched = [data.foodId, data.recipeId, data.freeText]
      const anyTouched = touched.some((value) => value !== undefined)
      return !anyTouched || countFilled(touched) === 1
    },
    {
      message: 'Bir kalem tam olarak bir besin, tarif veya serbest metin içermelidir.',
      path: ['foodId'],
    },
  )
export type PlanItemUpdateValues = z.infer<typeof planItemUpdateSchema>

export const planAlternativeInputSchema = planItemSourceSchema
export type PlanAlternativeInputValues = z.infer<typeof planAlternativeInputSchema>

export const reorderItemsSchema = z.object({
  mealId: z.string().min(1),
  orderedItemIds: z.array(z.string().min(1)).min(1, 'Sıralanacak en az bir kalem olmalıdır.'),
})
export type ReorderItemsValues = z.infer<typeof reorderItemsSchema>

// GitHub issue #25 / Prompt 5.3 — bkz. packages/db/src/queries/plans.ts
// moveItem üstündeki not: reorderItems'ın kapsamadığı "öğünler arası
// sürükle-bırak" için dar kapsamlı bir ek şema.
export const moveItemSchema = z.object({
  itemId: z.string().min(1),
  targetMealId: z.string().min(1),
  sortOrder: z.number().int().min(0),
})
export type MoveItemValues = z.infer<typeof moveItemSchema>

export function firstZodMessage(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? 'Geçersiz veri gönderildi.'
}

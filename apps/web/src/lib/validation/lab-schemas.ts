import { z } from 'zod'

// Laboratuvar sonucu giriş formu (GitHub issue #19 / Prompt 4.3, GÖREV 2).
// LAB_ANALYTE_PRESETS'ten (packages/nutrition-core) FARKLI bir dosyada
// tutuluyor OLABİLİRDİ ama analyte alanı serbest metin olduğu için (bkz.
// schema/health-records.ts labResults.analyte notu) burada ayrı bir
// sözlüğe gerek yok — form bileşeni preset listesini doğrudan
// nutrition-core'dan içe aktarıp autofill için kullanır.

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/

const testedAtSchema = z
  .string()
  .trim()
  .min(1, 'Tahlil tarihi zorunludur.')
  .refine((value) => isoDatePattern.test(value), 'Tahlil tarihi geçersiz.')
  .refine(
    (value) => !isoDatePattern.test(value) || new Date(value).getTime() <= Date.now() + 24 * 60 * 60 * 1000,
    'Tahlil tarihi gelecekte olamaz.',
  )

function numberField(label: string, opts: { min?: number; max?: number } = {}) {
  const { min = -1_000_000, max = 1_000_000 } = opts
  return z
    .string()
    .trim()
    .min(1, `${label} zorunludur.`)
    .refine((value) => Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max, `Geçerli bir ${label.toLowerCase()} girin.`)
}

function optionalNumberField(label: string) {
  return z
    .string()
    .trim()
    .refine((value) => value === '' || Number.isFinite(Number(value)), `Geçerli bir ${label.toLowerCase()} girin.`)
    .optional()
    .or(z.literal(''))
}

export const labResultFormSchema = z.object({
  testedAt: testedAtSchema,
  analyte: z.string().trim().min(1, 'Analit adı zorunludur.').max(120, 'Analit adı çok uzun.'),
  value: numberField('Değer'),
  unit: z.string().trim().min(1, 'Birim zorunludur.').max(30, 'Birim çok uzun.'),
  refMin: optionalNumberField('alt referans sınırı'),
  refMax: optionalNumberField('üst referans sınırı'),
  labName: z.string().trim().max(200, 'Laboratuvar adı çok uzun.').optional().or(z.literal('')),
  notes: z.string().trim().max(2000, 'Notlar çok uzun.').optional().or(z.literal('')),
})
export type LabResultFormValues = z.infer<typeof labResultFormSchema>

export const LAB_RESULT_FORM_DEFAULT_VALUES: LabResultFormValues = {
  testedAt: new Date().toISOString().slice(0, 10),
  analyte: '',
  value: '',
  unit: '',
  refMin: '',
  refMax: '',
  labName: '',
  notes: '',
}

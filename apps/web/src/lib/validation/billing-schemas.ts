import { z } from 'zod'
// TİP-ONLY içe aktarım — measurement-schemas.ts ile AYNI desen: drizzle-orm'u
// istemci paketine sürüklememek için değer listeleri burada elle tekrar
// tanımlanıyor.
import type { ClientPackageStatus, PaymentMethod } from '@ogun/db/schema'

// ---------------------------------------------------------------------------
// Sözlükler (UI etiketleri) — GitHub issue #40 / Prompt 7.2, GÖREV 1
// ---------------------------------------------------------------------------

export const PAYMENT_METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: 'nakit', label: 'Nakit' },
  { value: 'kart', label: 'Kart' },
  { value: 'havale', label: 'Havale/EFT' },
  { value: 'online', label: 'Online' },
]
export const PAYMENT_METHOD_LABELS_TR: Record<PaymentMethod, string> = {
  nakit: 'Nakit',
  kart: 'Kart',
  havale: 'Havale/EFT',
  online: 'Online',
}

export const CLIENT_PACKAGE_STATUS_LABELS_TR: Record<ClientPackageStatus, string> = {
  aktif: 'Aktif',
  tamamlandı: 'Tamamlandı',
  süresi_doldu: 'Süresi doldu',
  iptal: 'İptal',
}

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/

function positiveAmountField(label: string) {
  return z
    .string()
    .trim()
    .min(1, `${label} zorunludur.`)
    .refine((value) => Number.isFinite(Number(value)) && Number(value) > 0, `Geçerli bir ${label.toLowerCase()} girin.`)
    .refine((value) => Number(value) <= 1_000_000, `${label} 1.000.000'ı aşamaz.`)
}

// ---------------------------------------------------------------------------
// Paket TANIMI formu (klinik ayarları — /finans içindeki "Paketler" bölümü)
// ---------------------------------------------------------------------------

export const packageFormSchema = z.object({
  name: z.string().trim().min(1, 'Paket adı zorunludur.').max(120, 'Paket adı çok uzun.'),
  sessionCount: z.coerce.number().int().min(1, 'Seans sayısı en az 1 olmalıdır.').max(365),
  price: positiveAmountField('Fiyat'),
  validityDays: z
    .string()
    .trim()
    .refine((value) => value === '' || (Number.isInteger(Number(value)) && Number(value) > 0), 'Geçerlilik süresi geçersiz.')
    .optional()
    .or(z.literal('')),
})
export type PackageFormValues = z.infer<typeof packageFormSchema>

// ---------------------------------------------------------------------------
// Danışana paket satışı formu (Ödemeler sekmesi)
// ---------------------------------------------------------------------------

export const purchasePackageFormSchema = z.object({
  packageId: z.string().trim().min(1, 'Paket seçilmelidir.'),
  price: positiveAmountField('Fiyat'),
})
export type PurchasePackageFormValues = z.infer<typeof purchasePackageFormSchema>

// ---------------------------------------------------------------------------
// Ödeme kaydı formu (Ödemeler sekmesi) — e-SMM makbuz alanları OPSİYONEL
// (GÖREV 4: "kesim tarihi" vb. zorunlu tutulmadı, ödeme kaydı makbuzsuz da
// tamamlanabilir, makbuz bilgisi sonradan eklenebilir).
// ---------------------------------------------------------------------------

export const paymentFormSchema = z.object({
  clientPackageId: z.string().trim().optional().or(z.literal('')),
  amount: positiveAmountField('Tutar'),
  method: z.enum(['nakit', 'kart', 'havale', 'online']),
  paidAt: z
    .string()
    .trim()
    .min(1, 'Ödeme tarihi zorunludur.')
    .refine((value) => isoDatePattern.test(value), 'Ödeme tarihi geçersiz.'),
  notes: z.string().trim().max(500, 'Not çok uzun.').optional().or(z.literal('')),
  receiptSeries: z.string().trim().max(20, 'Seri çok uzun.').optional().or(z.literal('')),
  receiptSequenceNumber: z.string().trim().max(30, 'Sıra no çok uzun.').optional().or(z.literal('')),
})
export type PaymentFormValues = z.infer<typeof paymentFormSchema>

// ---------------------------------------------------------------------------
// Gider formu (/finans) — basit gider takibi
// ---------------------------------------------------------------------------

export const expenseFormSchema = z.object({
  category: z.string().trim().min(1, 'Kategori zorunludur.').max(80, 'Kategori çok uzun.'),
  amount: positiveAmountField('Tutar'),
  date: z
    .string()
    .trim()
    .min(1, 'Tarih zorunludur.')
    .refine((value) => isoDatePattern.test(value), 'Tarih geçersiz.'),
  description: z.string().trim().max(500, 'Açıklama çok uzun.').optional().or(z.literal('')),
})
export type ExpenseFormValues = z.infer<typeof expenseFormSchema>

import { z } from 'zod'
import type { DocumentCategory } from '@ogun/db/schema'

// Dosya yükleme (GitHub issue #19 / Prompt 4.3, GÖREV 3 + GÖREV 4).

export const DOCUMENT_CATEGORY_OPTIONS: { value: DocumentCategory; label: string }[] = [
  { value: 'tahlil', label: 'Tahlil' },
  { value: 'reçete', label: 'Reçete' },
  { value: 'bia_çıktısı', label: 'BİA çıktısı' },
  { value: 'fotoğraf', label: 'Fotoğraf' },
  { value: 'diğer', label: 'Diğer' },
]
export const DOCUMENT_CATEGORY_LABELS_TR: Record<DocumentCategory, string> = {
  tahlil: 'Tahlil',
  reçete: 'Reçete',
  bia_çıktısı: 'BİA çıktısı',
  fotoğraf: 'Fotoğraf',
  diğer: 'Diğer',
}

// Kabul edilen MIME tipleri — GÖREV 3 "Görsel ve PDF önizleme" ve GÖREV 4
// "InBody/Tanita PDF veya fotoğrafını yükle" kapsamıyla sınırlı. Genel amaçlı
// bir dosya deposu DEĞİL, klinik belge yönetimi (tahlil/reçete/BİA/fotoğraf)
// — bu yüzden ör. .docx/.xlsx BİLEREK kapsam dışı.
export const ACCEPTED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
] as const

export const MAX_DOCUMENT_SIZE_BYTES = 20 * 1024 * 1024 // 20 MB

export const presignUploadSchema = z.object({
  fileName: z.string().trim().min(1, 'Dosya adı zorunludur.').max(255, 'Dosya adı çok uzun.'),
  mimeType: z.enum(ACCEPTED_DOCUMENT_MIME_TYPES, {
    errorMap: () => ({ message: 'Desteklenmeyen dosya türü. Yalnızca PDF veya görsel yükleyebilirsiniz.' }),
  }),
  sizeBytes: z
    .number()
    .int()
    .positive('Dosya boyutu geçersiz.')
    .max(MAX_DOCUMENT_SIZE_BYTES, 'Dosya 20 MB üzerinde olamaz.'),
  category: z.enum(['tahlil', 'reçete', 'bia_çıktısı', 'fotoğraf', 'diğer']),
})
export type PresignUploadInput = z.infer<typeof presignUploadSchema>

export const confirmUploadSchema = presignUploadSchema.extend({
  storageKey: z.string().trim().min(1),
})
export type ConfirmUploadInput = z.infer<typeof confirmUploadSchema>

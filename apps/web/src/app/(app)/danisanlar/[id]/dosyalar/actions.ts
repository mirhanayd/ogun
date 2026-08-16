'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@ogun/db'
import { createDocument, deleteDocument, getDocumentById } from '@ogun/db/queries'
import { withAuth } from '@/lib/authz'
import { withAudit } from '@/lib/audit'
import { buildDocumentStorageKey, createPresignedDownloadUrl, createPresignedUploadUrl, deleteStorageObject } from '@/lib/storage'
import {
  confirmUploadSchema,
  presignUploadSchema,
  type ConfirmUploadInput,
  type PresignUploadInput,
} from '@/lib/validation/document-schemas'
import type { ClientActionResult } from '../../actions'

// GitHub issue #19 / Prompt 4.3, GÖREV 3 — dosya yükleme mutasyonları.
// İki AŞAMALI akış (measurements/lab-results'taki tek adımlı create'lerden
// FARKLI): 1) presignUploadAction sunucudan imzalı bir PUT URL'i ister
// (dosyanın KENDİSİ sunucudan HİÇ geçmez), 2) istemci dosyayı doğrudan
// MinIO/S3'e yükler, 3) confirmDocumentUploadAction yükleme bittikten SONRA
// DB satırını yazar. Üç adım da ayrı ayrı audit'lenir — presign "create"
// niyetini, confirm gerçek kaydı temsil eder.

function firstZodMessage(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? 'Geçersiz veri gönderildi.'
}

const presignUploadForClinic = withAuth(
  withAudit(
    {
      action: 'create',
      entityType: 'document',
      metadata: ([clientId, input]: [string, PresignUploadInput]) => ({
        clientId,
        fileName: input.fileName,
        category: input.category,
      }),
    },
    async (_ctx, clientId: string, input: PresignUploadInput) => {
      const storageKey = buildDocumentStorageKey(clientId, input.fileName)
      return createPresignedUploadUrl(storageKey, input.mimeType)
    },
  ),
)

export async function presignDocumentUploadAction(
  clientId: string,
  input: PresignUploadInput,
): Promise<(ClientActionResult & { uploadUrl?: string; storageKey?: string })> {
  const parsed = presignUploadSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: firstZodMessage(parsed.error) }
  }
  try {
    const { uploadUrl, storageKey } = await presignUploadForClinic(clientId, parsed.data)
    return { success: true, uploadUrl, storageKey }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Yükleme başlatılamadı.' }
  }
}

const confirmDocumentUploadForClinic = withAuth(
  withAudit(
    {
      action: 'create',
      entityType: 'document',
      entityId: (_args: [string, ConfirmUploadInput], result: { id: string } | undefined) => result?.id ?? null,
    },
    async (ctx, clientId: string, input: ConfirmUploadInput) =>
      createDocument(db, ctx.scope.clinicId, clientId, {
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        storageKey: input.storageKey,
        category: input.category,
        uploadedBy: ctx.user.id,
      }),
  ),
)

export async function confirmDocumentUploadAction(
  clientId: string,
  input: ConfirmUploadInput,
): Promise<ClientActionResult> {
  const parsed = confirmUploadSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: firstZodMessage(parsed.error) }
  }
  try {
    await confirmDocumentUploadForClinic(clientId, parsed.data)
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Belge kaydedilemedi.' }
  }
  revalidatePath(`/danisanlar/${clientId}`)
  return { success: true }
}

// Bir belgeyi GERÇEKTEN açıp görüntülemek (GÖREV 3 — "dosyalar asla public
// olmasın") — bkz. queries.ts dosya başı notu, bu listelemeden AYRI ve
// KENDİ audit kaydını üretir.
const getDocumentDownloadUrlForClinic = withAuth(
  withAudit(
    { action: 'read', entityType: 'document', entityId: ([documentId]: [string]) => documentId },
    async (ctx, documentId: string) => {
      const document = await getDocumentById(db, ctx.scope.clinicId, documentId)
      if (!document) throw new Error('Belge bulunamadı.')
      return { url: await createPresignedDownloadUrl(document.storageKey), mimeType: document.mimeType }
    },
  ),
)

export async function getDocumentDownloadUrlAction(
  documentId: string,
): Promise<(ClientActionResult & { url?: string; mimeType?: string })> {
  try {
    const { url, mimeType } = await getDocumentDownloadUrlForClinic(documentId)
    return { success: true, url, mimeType }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Belge açılamadı.' }
  }
}

const deleteDocumentForClinic = withAuth(
  withAudit(
    { action: 'delete', entityType: 'document', entityId: ([documentId]: [string]) => documentId },
    async (ctx, documentId: string) => deleteDocument(db, ctx.scope.clinicId, documentId),
  ),
)

export async function deleteDocumentAction(documentId: string, clientId: string): Promise<ClientActionResult> {
  try {
    const document = await deleteDocumentForClinic(documentId)
    // Nesnenin depolamadan (MinIO/S3) silinmesi — DB satırı zaten kaldırıldı,
    // depolama silme hatası bu işlemi BAŞARISIZ SAYMAZ (aksi halde "yarım
    // silinmiş" bir belge kaydı kalmaz ama depoda yetim bir nesne kalabilir
    // — bu, KVKK'nın gerektirdiği kalıcı silmeden DAHA AZ kritik, log'a düşer).
    try {
      await deleteStorageObject(document.storageKey)
    } catch (storageError) {
      console.error('[documents] Depolama nesnesi silinemedi:', storageError)
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Belge silinemedi.' }
  }
  revalidatePath(`/danisanlar/${clientId}`)
  return { success: true }
}

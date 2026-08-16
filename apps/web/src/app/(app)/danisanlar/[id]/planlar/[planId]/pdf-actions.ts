'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@ogun/db'
import { createDocument, getPlanById } from '@ogun/db/queries'
import { renderPlanPdfBuffer } from '@ogun/pdf/server'
import type { PdfPlanData } from '@ogun/pdf'
import { withAuth } from '@/lib/authz'
import { withAudit } from '@/lib/audit'
import { buildPlanPdfStorageKey, createPresignedDownloadUrl, uploadStorageObject } from '@/lib/storage'
import { resolvePlanPdfData } from '@/lib/pdf/resolve-plan-pdf-data'
import { pdfGenerationOptionsSchema, type PdfGenerationOptionsInput } from '@/lib/validation/pdf-schemas'
import type { PlanActionResult } from '@/app/(app)/planlar/actions'

// GitHub issue #35 / Prompt 6.1 — plan PDF'inin iki server action'ı:
//
// 1) getPlanPdfDataAction — İSTEMCİ tarafı önizleme (PDFViewer/BlobProvider,
//    bkz. plan-pdf-dialog.tsx) için resolve edilmiş VERİYİ (JSON) döner.
//    Gerçek PDF byte'larını üretmez/kaydetmez — sadece "read" olarak
//    denetlenir (plan verisini okuyor, bkz. lib/audit.ts).
// 2) generateAndSavePlanPdfAction — sunucu tarafında GERÇEK bir PDF Buffer'ı
//    üretir (@ogun/pdf/server renderPlanPdfBuffer, düz Node — mimari kural
//    #3), #19'un storage.ts'i ile private bucket'a yazar, documents.ts'e
//    (#19) 'diyet_listesi' kategorisiyle bir satır ekler (indirme geçmişinde
//    görünsün diye) VE indirilebilir bir presigned URL döner. "create" olarak
//    denetlenir. #36'nın (paylaşım linki) devralacağı YER burası: bu action
//    zaten gerçek bir Buffer üretiyor, #36 sadece storageKey'i public bir
//    paylaşım rotasına bağlayacak.

const getPlanPdfDataForClinic = withAuth(
  withAudit(
    {
      action: 'read',
      entityType: 'diet_plan',
      entityId: ([planId]: [string, PdfGenerationOptionsInput]) => planId,
    },
    async (ctx, planId: string, options: PdfGenerationOptionsInput) =>
      resolvePlanPdfData(db, ctx.scope.clinicId, planId, options),
  ),
)

export async function getPlanPdfDataAction(
  planId: string,
  options: PdfGenerationOptionsInput,
): Promise<PlanActionResult<PdfPlanData>> {
  const parsed = pdfGenerationOptionsSchema.safeParse(options)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Geçersiz veri gönderildi.' }
  }
  try {
    const data = await getPlanPdfDataForClinic(planId, parsed.data)
    return { success: true, data }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'PDF verisi hazırlanamadı.' }
  }
}

const generateAndSavePlanPdfForClinic = withAuth(
  withAudit(
    {
      action: 'create',
      entityType: 'document',
      entityId: (_args: [string, PdfGenerationOptionsInput], result: { id: string } | undefined) =>
        result?.id ?? null,
      metadata: ([planId]: [string, PdfGenerationOptionsInput]) => ({ planId, category: 'diyet_listesi' }),
    },
    async (ctx, planId: string, options: PdfGenerationOptionsInput) => {
      // resolvePlanPdfData zaten şablon (clientId=null) planları reddediyor
      // (bkz. o dosyanın notu) — burada documents.clientId FK'sı için AYRICA
      // planı (hafif bir satır, tree DEĞİL) çekiyoruz; PdfPlanData'ya BİLEREK
      // clientId eklemedik (packages/pdf'in DB kimliklerinden bağımsız kalma
      // kuralı, bkz. packages/pdf/src/types.ts dosya başı notu).
      const plan = await getPlanById(db, ctx.scope.clinicId, planId)
      if (!plan || !plan.clientId) throw new Error('Plan veya danışan bulunamadı.')

      const data = await resolvePlanPdfData(db, ctx.scope.clinicId, planId, options)
      const buffer = await renderPlanPdfBuffer(data)

      const storageKey = buildPlanPdfStorageKey(plan.clientId, planId)
      const safeName = plan.name.replace(/[^a-zA-Z0-9ığüşöçİĞÜŞÖÇ _-]/g, '').trim()
      await uploadStorageObject(storageKey, buffer, 'application/pdf')

      return createDocument(db, ctx.scope.clinicId, plan.clientId, {
        fileName: `${safeName || 'diyet-plani'}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: buffer.byteLength,
        storageKey,
        category: 'diyet_listesi',
        uploadedBy: ctx.user.id,
      })
    },
  ),
)

export async function generateAndSavePlanPdfAction(
  planId: string,
  clientId: string,
  options: PdfGenerationOptionsInput,
): Promise<PlanActionResult<{ documentId: string; downloadUrl: string }>> {
  const parsed = pdfGenerationOptionsSchema.safeParse(options)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Geçersiz veri gönderildi.' }
  }
  try {
    const document = await generateAndSavePlanPdfForClinic(planId, parsed.data)
    const downloadUrl = await createPresignedDownloadUrl(document.storageKey)
    revalidatePath(`/danisanlar/${clientId}`)
    return { success: true, data: { documentId: document.id, downloadUrl } }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'PDF üretilemedi.' }
  }
}

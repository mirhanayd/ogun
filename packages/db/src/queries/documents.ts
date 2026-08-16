import { and, desc, eq } from 'drizzle-orm'
import { clients } from '../schema/clients'
import { documents, type DocumentCategory } from '../schema/health-records'
import type { Database } from '../client'

// Dosya/belge kayıtları (GitHub issue #19 / Prompt 4.3, GÖREV 3) —
// lab-results.ts ile AYNI indirekt clinicId-scoping deseni. Bu dosya SADECE
// veritabanı satırını yönetir — nesnenin KENDİSİ apps/web/src/lib/storage.ts
// üzerinden S3 uyumlu depolamaya gider, burası storageKey'i bir referans
// olarak tutar (bkz. schema/health-records.ts documents üstündeki not).

async function assertClientInClinic(db: Database, clinicId: string, clientId: string): Promise<void> {
  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.clinicId, clinicId)))
    .limit(1)
  if (!client) {
    throw new Error('Danışan bulunamadı.')
  }
}

export interface DocumentInput {
  fileName: string
  mimeType: string
  sizeBytes: number
  storageKey: string
  category: DocumentCategory
  uploadedBy: string
}

// Presigned URL ile YÜKLEME nesne depolamaya (MinIO/S3) doğrudan gider —
// bu fonksiyon yükleme TAMAMLANDIKTAN SONRA istemcinin çağırdığı "belgeyi
// kaydet" adımı (bkz. apps/web/src/app/(app)/danisanlar/[id]/dosyalar/actions.ts
// confirmDocumentUploadAction).
export async function createDocument(db: Database, clinicId: string, clientId: string, input: DocumentInput) {
  await assertClientInClinic(db, clinicId, clientId)
  const [row] = await db
    .insert(documents)
    .values({
      clientId,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      storageKey: input.storageKey,
      category: input.category,
      uploadedBy: input.uploadedBy,
    })
    .returning()
  if (!row) throw new Error('Belge kaydedilemedi.')
  return row
}

export async function listDocumentsForClient(
  db: Database,
  clinicId: string,
  clientId: string,
  options: { category?: DocumentCategory } = {},
) {
  const conditions = [eq(documents.clientId, clientId), eq(clients.clinicId, clinicId)]
  if (options.category) {
    conditions.push(eq(documents.category, options.category))
  }
  return db
    .select()
    .from(documents)
    .innerJoin(clients, eq(clients.id, documents.clientId))
    .where(and(...conditions))
    .orderBy(desc(documents.createdAt))
    .then((rows) => rows.map((row) => row.documents))
}

export async function getDocumentById(db: Database, clinicId: string, documentId: string) {
  const [row] = await db
    .select({ document: documents })
    .from(documents)
    .innerJoin(clients, eq(clients.id, documents.clientId))
    .where(and(eq(documents.id, documentId), eq(clients.clinicId, clinicId)))
    .limit(1)
  return row?.document ?? null
}

// Belge silme — nesnenin depolamadan (S3/MinIO) SİLİNMESİ çağıran tarafın
// (actions.ts) sorumluluğu, bu fonksiyon sadece DB satırını kaldırır (aynı
// "önce doğrula, sonra sil" deseni, bkz. deleteLabResult).
export async function deleteDocument(db: Database, clinicId: string, documentId: string) {
  const document = await getDocumentById(db, clinicId, documentId)
  if (!document) {
    throw new Error('Belge bulunamadı.')
  }
  await db.delete(documents).where(eq(documents.id, documentId))
  return document
}

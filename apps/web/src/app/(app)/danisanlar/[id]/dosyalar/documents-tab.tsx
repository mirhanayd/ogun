import { getClientLatestMeasurement } from '../measurements/queries'
import { listClientDocuments } from './queries'
import type { DocumentRow } from './document-list'
import { confirmDocumentUploadAction, deleteDocumentAction, getDocumentDownloadUrlAction, presignDocumentUploadAction } from './actions'
import { createMeasurementAction } from '../measurements/actions'
import { DocumentsView } from '@/screens/documents-view'

export async function DocumentsTab({ clientId }: { clientId: string }) {
  const [rows, latest] = await Promise.all([listClientDocuments(clientId), getClientLatestMeasurement(clientId)])
  const documents: DocumentRow[] = rows.map((row) => ({ id: row.id, fileName: row.fileName, mimeType: row.mimeType, sizeBytes: row.sizeBytes, category: row.category, createdAt: row.createdAt.toISOString() }))
  const previousMeasurement = latest && (latest.weightKg !== null || latest.heightCm !== null) ? { measuredAt: latest.measuredAt.toISOString(), weightKg: latest.weightKg !== null ? Number(latest.weightKg) : null, heightCm: latest.heightCm !== null ? Number(latest.heightCm) : null } : null
  async function onDeleteDocument(id: string) { 'use server'; return deleteDocumentAction(id, clientId) }
  return <DocumentsView clientId={clientId} documents={documents} previousMeasurement={previousMeasurement} uploadPersistence={{ presign: presignDocumentUploadAction, confirm: confirmDocumentUploadAction }} onSaveMeasurement={createMeasurementAction.bind(null, clientId)} onViewDocument={getDocumentDownloadUrlAction} onDeleteDocument={onDeleteDocument} />
}

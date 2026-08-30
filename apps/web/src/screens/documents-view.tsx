import { Card, CardContent } from '@/components/ui/card'
import { DocumentUploader, type DocumentUploadPersistence } from '@/app/(app)/danisanlar/[id]/dosyalar/document-uploader'
import { DocumentList, type DocumentRow } from '@/app/(app)/danisanlar/[id]/dosyalar/document-list'
import { BiaImportPanel } from '@/app/(app)/danisanlar/[id]/dosyalar/bia-import-panel'
import type { PreviousMeasurementSummary } from '@/app/(app)/danisanlar/[id]/measurements/measurement-form'
import type { MeasurementFormValues } from '@/lib/validation/measurement-schemas'

export function DocumentsView({ clientId, documents, previousMeasurement, uploadPersistence, onSaveMeasurement, onViewDocument, onDeleteDocument }: {
  clientId: string
  documents: DocumentRow[]
  previousMeasurement: PreviousMeasurementSummary | null
  uploadPersistence: DocumentUploadPersistence
  onSaveMeasurement: (values: MeasurementFormValues) => Promise<{ success: boolean; error?: string }>
  onViewDocument: (id: string) => Promise<{ success: boolean; url?: string; error?: string }>
  onDeleteDocument: (id: string) => Promise<unknown>
}) {
  const biaDocuments = documents.filter((doc) => doc.category === 'bia_çıktısı')
  return <div className="flex flex-col gap-4">
    <Card><CardContent className="flex flex-col gap-3"><p className="text-sm font-medium">Belge yükle</p><DocumentUploader clientId={clientId} persistence={uploadPersistence} /></CardContent></Card>
    <div className="flex flex-col gap-2"><p className="text-sm font-medium">Tüm belgeler</p><DocumentList documents={documents} onView={onViewDocument} onDelete={onDeleteDocument} /></div>
    <BiaImportPanel clientId={clientId} previousMeasurement={previousMeasurement} biaDocuments={biaDocuments} uploadPersistence={uploadPersistence} onSaveMeasurement={onSaveMeasurement} onViewDocument={onViewDocument} onDeleteDocument={onDeleteDocument} />
  </div>
}

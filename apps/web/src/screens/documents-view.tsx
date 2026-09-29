import { Files } from 'lucide-react'
import {
  DocumentUploader,
  type DocumentUploadPersistence,
} from '@/app/(app)/danisanlar/[id]/dosyalar/document-uploader'
import { DocumentList, type DocumentRow } from '@/app/(app)/danisanlar/[id]/dosyalar/document-list'
import { BiaImportPanel } from '@/app/(app)/danisanlar/[id]/dosyalar/bia-import-panel'
import type { PreviousMeasurementSummary } from '@/app/(app)/danisanlar/[id]/measurements/measurement-form'
import type { MeasurementFormValues } from '@/lib/validation/measurement-schemas'
import { ClientWorkspaceHeader, ClientWorkspaceSection } from '@/screens/client-workspace'

export function DocumentsView({
  clientId,
  documents,
  previousMeasurement,
  uploadPersistence,
  onSaveMeasurement,
  onViewDocument,
  onDeleteDocument,
}: {
  clientId: string
  documents: DocumentRow[]
  previousMeasurement: PreviousMeasurementSummary | null
  uploadPersistence: DocumentUploadPersistence
  onSaveMeasurement: (
    values: MeasurementFormValues,
  ) => Promise<{ success: boolean; error?: string }>
  onViewDocument: (id: string) => Promise<{ success: boolean; url?: string; error?: string }>
  onDeleteDocument: (id: string) => Promise<unknown>
}) {
  const biaDocuments = documents.filter((doc) => doc.category === 'bia_çıktısı')
  return (
    <div className="flex flex-col gap-6">
      <ClientWorkspaceHeader
        icon={Files}
        title="Dosyalar"
        description="Tahlil, rapor ve cihaz çıktılarını danışan kaydıyla birlikte güvenli biçimde yönetin."
        meta={`${documents.length} dosya`}
      />
      <ClientWorkspaceSection
        title="Belge yükle"
        description="PDF veya görsel dosyayı uygun kategoriyle ekleyin."
      >
        <DocumentUploader clientId={clientId} persistence={uploadPersistence} />
      </ClientWorkspaceSection>
      <ClientWorkspaceSection title="Tüm belgeler">
        <DocumentList documents={documents} onView={onViewDocument} onDelete={onDeleteDocument} />
      </ClientWorkspaceSection>
      <BiaImportPanel
        clientId={clientId}
        previousMeasurement={previousMeasurement}
        biaDocuments={biaDocuments}
        uploadPersistence={uploadPersistence}
        onSaveMeasurement={onSaveMeasurement}
        onViewDocument={onViewDocument}
        onDeleteDocument={onDeleteDocument}
      />
    </div>
  )
}

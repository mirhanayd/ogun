import { Card, CardContent } from '@/components/ui/card'
import { getClientLatestMeasurement } from '../measurements/queries'
import { listClientDocuments } from './queries'
import { DocumentUploader } from './document-uploader'
import { DocumentList, type DocumentRow } from './document-list'
import { BiaImportPanel } from './bia-import-panel'

// "Dosyalar" sekmesinin gerçek içeriği (GitHub issue #19 / Prompt 4.3,
// GÖREV 3 + GÖREV 4) — [id]/page.tsx'teki EmptyState stub'ının yerini alır.
export async function DocumentsTab({ clientId }: { clientId: string }) {
  const [rows, latestMeasurement] = await Promise.all([
    listClientDocuments(clientId),
    getClientLatestMeasurement(clientId),
  ])

  const documents: DocumentRow[] = rows.map((row) => ({
    id: row.id,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    category: row.category,
    createdAt: row.createdAt.toISOString(),
  }))

  const biaDocuments = documents.filter((doc) => doc.category === 'bia_çıktısı')

  const previousMeasurement =
    latestMeasurement && (latestMeasurement.weightKg !== null || latestMeasurement.heightCm !== null)
      ? {
          measuredAt: latestMeasurement.measuredAt.toISOString(),
          weightKg: latestMeasurement.weightKg !== null ? Number(latestMeasurement.weightKg) : null,
          heightCm: latestMeasurement.heightCm !== null ? Number(latestMeasurement.heightCm) : null,
        }
      : null

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm font-medium">Belge yükle</p>
          <DocumentUploader clientId={clientId} />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Tüm belgeler</p>
        <DocumentList clientId={clientId} documents={documents} />
      </div>

      <BiaImportPanel clientId={clientId} previousMeasurement={previousMeasurement} biaDocuments={biaDocuments} />
    </div>
  )
}

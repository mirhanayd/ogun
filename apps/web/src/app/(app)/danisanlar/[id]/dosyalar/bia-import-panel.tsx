import { Card, CardContent } from '@/components/ui/card'
import { MeasurementForm, type PreviousMeasurementSummary } from '../measurements/measurement-form'
import { DocumentUploader } from './document-uploader'
import { DocumentList, type DocumentRow } from './document-list'

// GÖREV 4 — "BİA çıktısı içe aktarma (v1: yarı otomatik). InBody/Tanita PDF
// veya fotoğrafını yükle. Şimdilik OCR YAPMA. Sadece dosyayı ekle ve yanına
// manuel giriş formunu aç, yan yana göster ki diyetisyen bakarak hızlıca
// girsin."
//
// OCR — v2 NOTU: cihaz çıktısındaki değerleri (kilo, yağ %, faz açısı vb.)
// otomatik okuyup formu doldurmak, roadmap'in KENDİSİNİN de belirttiği gibi
// "tek başına satın alma sebebi olacak" büyük bir özellik — bu issue'nun
// (v1, yarı otomatik) kapsamı DIŞINDA BİLEREK bırakıldı. Burada SADECE
// dosya + formun yan yana gösterimi var; diyetisyen cihaz çıktısına bakıp
// değerleri elle girer.
export function BiaImportPanel({
  clientId,
  previousMeasurement,
  biaDocuments,
}: {
  clientId: string
  previousMeasurement: PreviousMeasurementSummary | null
  biaDocuments: DocumentRow[]
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">BİA çıktısı içe aktarma</p>
          <p className="text-sm text-muted-foreground">
            InBody/Tanita/Accuniq çıktısının PDF&apos;ini veya fotoğrafını yükleyin, değerleri
            yandaki formdan bakarak hızlıca girin (otomatik okuma — OCR — bu sürümde YOK).
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-3">
            <DocumentUploader clientId={clientId} fixedCategory="bia_çıktısı" />
            <DocumentList clientId={clientId} documents={biaDocuments} />
          </div>
          <div className="rounded-lg border p-3">
            <MeasurementForm clientId={clientId} previousMeasurement={previousMeasurement} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

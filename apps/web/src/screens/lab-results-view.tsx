import { FlaskConical } from 'lucide-react'
import { LabResultForm } from '@/app/(app)/danisanlar/[id]/laboratuvar/lab-result-form'
import { LabChart } from '@/app/(app)/danisanlar/[id]/laboratuvar/lab-chart'
import { LabResultsList } from '@/app/(app)/danisanlar/[id]/laboratuvar/lab-results-list'
import type { LabResultFormValues } from '@/lib/validation/lab-schemas'
import {
  ClientMetricStrip,
  ClientWorkspaceHeader,
  ClientWorkspaceSection,
} from '@/screens/client-workspace'

export interface LabResultChartPoint {
  id: string
  testedAt: string
  analyte: string
  value: number
  unit: string
  refMin: number | null
  refMax: number | null
  isAbnormal: boolean | null
}

export function LabResultsView({
  results,
  onSave,
  onDelete,
}: {
  results: LabResultChartPoint[]
  onSave: (values: LabResultFormValues) => Promise<{ success: boolean; error?: string }>
  onDelete: (id: string) => Promise<unknown>
}) {
  const abnormalCount = results.filter((result) => result.isAbnormal === true).length
  const latest = [...results].sort((a, b) => b.testedAt.localeCompare(a.testedAt))[0]
  return (
    <div className="flex flex-col gap-6">
      <ClientWorkspaceHeader
        icon={FlaskConical}
        title="Laboratuvar sonuçları"
        description="Tahlil değerlerini referans aralıklarıyla kaydedin ve zaman içindeki değişimi izleyin."
        meta={`${results.length} sonuç`}
      />
      <ClientMetricStrip
        items={[
          { label: 'Toplam sonuç', value: results.length, detail: 'Kayıtlı değer' },
          {
            label: 'Anormal değer',
            value: abnormalCount,
            detail: abnormalCount > 0 ? 'İnceleme gerekiyor' : 'Uyarı yok',
            tone: abnormalCount > 0 ? 'alert' : 'default',
          },
          {
            label: 'Son tahlil',
            value: latest
              ? new Date(latest.testedAt).toLocaleDateString('tr-TR', {
                  day: '2-digit',
                  month: 'short',
                })
              : '—',
            detail: latest?.analyte ?? 'Kayıt yok',
          },
        ]}
      />
      <ClientWorkspaceSection
        title="Yeni sonuç"
        description="Hazır analit listesini kullanın veya değeri elle girin."
      >
        <LabResultForm onSave={onSave} />
      </ClientWorkspaceSection>
      {results.length > 0 ? (
        <ClientWorkspaceSection
          title="Değişim grafiği"
          description="Aynı analitin farklı tarihlerdeki sonuçlarını karşılaştırın."
        >
          <LabChart results={results} />
        </ClientWorkspaceSection>
      ) : null}
      <ClientWorkspaceSection title="Tüm sonuçlar">
        {results.length > 0 ? (
          <LabResultsList results={[...results].reverse()} onDelete={onDelete} />
        ) : (
          <p className="py-4 text-sm text-muted-foreground">
            Henüz laboratuvar sonucu eklenmedi. İlk sonuç kaydedildiğinde geçmiş burada görünür.
          </p>
        )}
      </ClientWorkspaceSection>
    </div>
  )
}

import { Card, CardContent } from '@/components/ui/card'
import { listClientLabResults } from './queries'
import { LabResultForm } from './lab-result-form'
import { LabChart } from './lab-chart'
import { LabResultsList } from './lab-results-list'

export interface LabResultChartPoint {
  id: string
  testedAt: string // ISO
  analyte: string
  value: number
  unit: string
  refMin: number | null
  refMax: number | null
  isAbnormal: boolean | null
}

// "Laboratuvar" sekmesinin gerçek içeriği (GitHub issue #19 / Prompt 4.3,
// GÖREV 2) — [id]/page.tsx'teki EmptyState stub'ının yerini alır.
// measurements-tab.tsx (GitHub #18) ile AYNI desen: kendi verisini kendisi
// çeker.
export async function LabResultsTab({ clientId }: { clientId: string }) {
  const rows = await listClientLabResults(clientId)

  const chartPoints: LabResultChartPoint[] = rows.map((row) => ({
    id: row.id,
    testedAt: row.testedAt.toISOString(),
    analyte: row.analyte,
    value: row.value,
    unit: row.unit,
    refMin: row.refMin,
    refMax: row.refMax,
    isAbnormal: row.isAbnormal,
  }))

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent>
          <LabResultForm clientId={clientId} />
        </CardContent>
      </Card>

      {chartPoints.length > 0 ? (
        <Card>
          <CardContent>
            <LabChart results={chartPoints} />
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">
          Henüz laboratuvar sonucu eklenmedi — yukarıdaki formla ilk sonucu ekleyerek zaman
          serisi grafiğini görüntüleyin.
        </p>
      )}

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Tüm sonuçlar</p>
        <LabResultsList clientId={clientId} results={[...chartPoints].reverse()} />
      </div>
    </div>
  )
}

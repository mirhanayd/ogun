import { Card, CardContent } from '@/components/ui/card'
import { LabResultForm } from '@/app/(app)/danisanlar/[id]/laboratuvar/lab-result-form'
import { LabChart } from '@/app/(app)/danisanlar/[id]/laboratuvar/lab-chart'
import { LabResultsList } from '@/app/(app)/danisanlar/[id]/laboratuvar/lab-results-list'
import type { LabResultFormValues } from '@/lib/validation/lab-schemas'

export interface LabResultChartPoint { id: string; testedAt: string; analyte: string; value: number; unit: string; refMin: number | null; refMax: number | null; isAbnormal: boolean | null }

export function LabResultsView({ results, onSave, onDelete }: { results: LabResultChartPoint[]; onSave: (values: LabResultFormValues) => Promise<{ success: boolean; error?: string }>; onDelete: (id: string) => Promise<unknown> }) {
  return <div className="flex flex-col gap-4">
    <Card><CardContent><LabResultForm onSave={onSave} /></CardContent></Card>
    {results.length > 0 ? <Card><CardContent><LabChart results={results} /></CardContent></Card> : <p className="text-sm text-muted-foreground">Henüz laboratuvar sonucu eklenmedi — yukarıdaki formla ilk sonucu ekleyerek zaman serisi grafiğini görüntüleyin.</p>}
    <div className="flex flex-col gap-2"><p className="text-sm font-medium">Tüm sonuçlar</p><LabResultsList results={[...results].reverse()} onDelete={onDelete} /></div>
  </div>
}

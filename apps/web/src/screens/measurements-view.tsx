import { Card, CardContent } from '@/components/ui/card'
import { MeasurementForm } from '@/app/(app)/danisanlar/[id]/measurements/measurement-form'
import { ProgressCharts, type ChartMeasurement } from '@/app/(app)/danisanlar/[id]/measurements/progress-charts'
import { GoalPanel, type ActiveGoalRow } from '@/app/(app)/danisanlar/[id]/measurements/goal-panel'
import type { GoalFormValues, MeasurementFormValues } from '@/lib/validation/measurement-schemas'

export function MeasurementsView({ clientId, measurements, activeGoals, weightGoal, onSaveMeasurement, onCreateGoal, onAchieveGoal }: {
  clientId: string
  measurements: ChartMeasurement[]
  activeGoals: ActiveGoalRow[]
  weightGoal: { targetValue: number } | null
  onSaveMeasurement: (values: MeasurementFormValues) => Promise<{ success: boolean; error?: string }>
  onCreateGoal: (values: GoalFormValues) => Promise<{ success: boolean; error?: string }>
  onAchieveGoal: (goalId: string) => Promise<{ success: boolean; error?: string }>
}) {
  const latest = measurements[measurements.length - 1] ?? null
  return <div className="flex flex-col gap-4">
    <Card><CardContent><MeasurementForm clientId={clientId} previousMeasurement={latest ? { measuredAt: latest.measuredAt, weightKg: latest.weightKg, heightCm: latest.heightCm } : null} onSave={onSaveMeasurement} /></CardContent></Card>
    {measurements.length > 0 ? <Card><CardContent><ProgressCharts measurements={measurements} weightGoal={weightGoal} /></CardContent></Card> : <p className="text-sm text-muted-foreground">Henüz ölçüm eklenmedi — yukarıdaki formla ilk ölçümü ekleyerek ilerleme grafiklerini görüntüleyin.</p>}
    <div className="flex flex-col gap-2"><p className="text-sm font-medium">Hedef takibi</p><GoalPanel clientId={clientId} activeGoals={activeGoals} measurements={measurements} onCreateGoal={onCreateGoal} onAchieveGoal={onAchieveGoal} /></div>
  </div>
}

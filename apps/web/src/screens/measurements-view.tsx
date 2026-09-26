import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { OgunMeasure } from '@/components/ogun-icons'
import { TanitaDeviceDetails } from '@/components/tanita-import-control'
import { MeasurementForm } from '@/app/(app)/danisanlar/[id]/measurements/measurement-form'
import {
  ProgressCharts,
  type ChartMeasurement,
} from '@/app/(app)/danisanlar/[id]/measurements/progress-charts'
import { GoalPanel, type ActiveGoalRow } from '@/app/(app)/danisanlar/[id]/measurements/goal-panel'
import type { GoalFormValues, MeasurementFormValues } from '@/lib/validation/measurement-schemas'

export function MeasurementsView({
  measurements,
  activeGoals,
  weightGoal,
  onSaveMeasurement,
  onCreateGoal,
  onAchieveGoal,
}: {
  measurements: ChartMeasurement[]
  activeGoals: ActiveGoalRow[]
  weightGoal: { targetValue: number } | null
  onSaveMeasurement: (
    values: MeasurementFormValues,
  ) => Promise<{ success: boolean; error?: string }>
  onCreateGoal: (values: GoalFormValues) => Promise<{ success: boolean; error?: string }>
  onAchieveGoal: (goalId: string) => Promise<{ success: boolean; error?: string }>
}) {
  const latest = measurements[measurements.length - 1] ?? null
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2">
            <OgunMeasure className="size-5 text-muted-foreground" />
            Yeni ölçüm
          </CardTitle>
          <CardDescription>
            Ölçümü elle girin veya mevcut cihaz içe aktarma seçeneklerini kullanın.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MeasurementForm
            previousMeasurement={
              latest
                ? {
                    measuredAt: latest.measuredAt,
                    weightKg: latest.weightKg,
                    heightCm: latest.heightCm,
                  }
                : null
            }
            onSave={onSaveMeasurement}
            existingImportFingerprints={measurements.flatMap((row) =>
              row.deviceImport ? [row.deviceImport.fingerprint] : [],
            )}
          />
        </CardContent>
      </Card>
      {measurements
        .filter((row) => row.deviceImport)
        .map((row) => (
          <TanitaDeviceDetails key={row.id} deviceImport={row.deviceImport!} />
        ))}
      {measurements.length > 0 ? (
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Ölçüm geçmişi</CardTitle>
            <CardDescription>Kayıtlı ölçümler ve hedef doğrultusundaki değişim.</CardDescription>
          </CardHeader>
          <CardContent>
            <ProgressCharts measurements={measurements} weightGoal={weightGoal} />
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">
          Henüz ölçüm eklenmedi — yukarıdaki formla ilk ölçümü ekleyerek ilerleme grafiklerini
          görüntüleyin.
        </p>
      )}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Hedef takibi</p>
        <GoalPanel
          activeGoals={activeGoals}
          measurements={measurements}
          onCreateGoal={onCreateGoal}
          onAchieveGoal={onAchieveGoal}
        />
      </div>
    </div>
  )
}

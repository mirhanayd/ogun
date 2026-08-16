import { Card, CardContent } from '@/components/ui/card'
import { getClientActiveGoal, listClientMeasurements } from './queries'
import { MeasurementForm } from './measurement-form'
import { ProgressCharts, type ChartMeasurement } from './progress-charts'
import { GoalPanel, type ActiveGoalRow } from './goal-panel'

// "Ölçümler" sekmesinin gerçek içeriği (GitHub issue #18 / Prompt 4.2) —
// [id]/page.tsx'teki EmptyState stub'ının (bkz. o dosyanın "olcumler"
// TabsContent'i) yerini alır. Kendi verisini KENDİSİ çeker (page.tsx sadece
// client+dietitians çekiyor, GitHub issue #17 kapsamındaydı) — measurements/
// client_goals bu issue'da açılan AYRI tablolar.
export async function MeasurementsTab({ clientId }: { clientId: string }) {
  const [measurementRows, weightGoal, bodyFatGoal, circumferenceGoal] = await Promise.all([
    listClientMeasurements(clientId, {}),
    getClientActiveGoal(clientId, 'kilo'),
    getClientActiveGoal(clientId, 'yağ_oranı'),
    getClientActiveGoal(clientId, 'çevre'),
  ])

  // numeric sütunlar DB'den string döner (bkz. queries/measurements.ts dosya
  // başı notu) — istemci bileşenlerine (grafik/form) geçmeden önce number'a
  // çevrilir, Date'ler ISO string'e (RSC serileştirme + saat dilimi
  // belirsizliğinden kaçınmak için tek biçim).
  const chartMeasurements: ChartMeasurement[] = measurementRows.map((row) => ({
    id: row.id,
    measuredAt: row.measuredAt.toISOString(),
    source: row.source,
    weightKg: row.weightKg !== null ? Number(row.weightKg) : null,
    heightCm: row.heightCm !== null ? Number(row.heightCm) : null,
    waistCm: row.waistCm !== null ? Number(row.waistCm) : null,
    hipCm: row.hipCm !== null ? Number(row.hipCm) : null,
    neckCm: row.neckCm !== null ? Number(row.neckCm) : null,
    armCm: row.armCm !== null ? Number(row.armCm) : null,
    thighCm: row.thighCm !== null ? Number(row.thighCm) : null,
    chestCm: row.chestCm !== null ? Number(row.chestCm) : null,
    bodyFatPct: row.bodyFatPct !== null ? Number(row.bodyFatPct) : null,
    notes: row.notes,
  }))

  const latest = chartMeasurements[chartMeasurements.length - 1] ?? null

  const activeGoals: ActiveGoalRow[] = [weightGoal, bodyFatGoal, circumferenceGoal]
    .filter((goal): goal is NonNullable<typeof goal> => goal !== null)
    .map((goal) => ({
      id: goal.id,
      type: goal.type,
      targetValue: Number(goal.targetValue),
      targetDate: goal.targetDate,
      startValue: Number(goal.startValue),
      startedAt: goal.startedAt.toISOString(),
    }))

  const weightGoalSummary = weightGoal ? { targetValue: Number(weightGoal.targetValue) } : null

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent>
          <MeasurementForm
            clientId={clientId}
            previousMeasurement={
              latest
                ? {
                    measuredAt: latest.measuredAt,
                    weightKg: latest.weightKg,
                    heightCm: latest.heightCm,
                  }
                : null
            }
          />
        </CardContent>
      </Card>

      {chartMeasurements.length > 0 ? (
        <Card>
          <CardContent>
            <ProgressCharts measurements={chartMeasurements} weightGoal={weightGoalSummary} />
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
        <GoalPanel clientId={clientId} activeGoals={activeGoals} measurements={chartMeasurements} />
      </div>
    </div>
  )
}

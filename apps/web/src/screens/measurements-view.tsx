import { OgunMeasure } from '@/components/ogun-icons'
import { TanitaDeviceDetails } from '@/components/tanita-import-control'
import {
  ClientMetricStrip,
  ClientWorkspaceHeader,
  ClientWorkspaceSection,
} from '@/screens/client-workspace'
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
    <div className="flex flex-col gap-6">
      <ClientWorkspaceHeader
        icon={OgunMeasure}
        title="Ölçüm ve hedef takibi"
        description="Yeni ölçüm girin, klinik değişimi grafiklerden izleyin ve aktif hedefleri yönetin."
        meta={`${measurements.length} ölçüm`}
      />
      <ClientMetricStrip
        items={[
          {
            label: 'Son kilo',
            value: latest?.weightKg != null ? `${latest.weightKg} kg` : '—',
            detail: latest ? new Date(latest.measuredAt).toLocaleDateString('tr-TR') : 'Kayıt yok',
          },
          {
            label: 'Yağ oranı',
            value: latest?.bodyFatPct != null ? `%${latest.bodyFatPct}` : '—',
            detail: 'Son ölçüm',
          },
          {
            label: 'Aktif hedef',
            value: activeGoals.length,
            detail: activeGoals.length > 0 ? 'Takip ediliyor' : 'Henüz belirlenmedi',
          },
        ]}
      />
      <div className="grid min-w-0 grid-cols-1 gap-x-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(19rem,0.85fr)]">
        <ClientWorkspaceSection
          title="Yeni ölçüm"
          description="Hızlı kilo girişi yapın veya ayrıntılı vücut ölçülerini kaydedin."
        >
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
        </ClientWorkspaceSection>
        <ClientWorkspaceSection
          title="Hedefler"
          description="Kilo, yağ oranı ve bel çevresi hedeflerinin güncel durumunu izleyin."
        >
          <GoalPanel
            activeGoals={activeGoals}
            measurements={measurements}
            onCreateGoal={onCreateGoal}
            onAchieveGoal={onAchieveGoal}
          />
        </ClientWorkspaceSection>
      </div>
      {measurements
        .filter((row) => row.deviceImport)
        .map((row) => (
          <TanitaDeviceDetails key={row.id} deviceImport={row.deviceImport!} />
        ))}
      {measurements.length > 0 ? (
        <ClientWorkspaceSection
          title="Ölçüm geçmişi"
          description="Kayıtlı ölçümleri zaman aralığına göre karşılaştırın; ayrıntı için grafik noktasını seçin."
        >
          <ProgressCharts measurements={measurements} weightGoal={weightGoal} />
        </ClientWorkspaceSection>
      ) : (
        <ClientWorkspaceSection title="Ölçüm geçmişi">
          <p className="py-4 text-sm text-muted-foreground">
            Henüz ölçüm eklenmedi. İlk ölçüm kaydedildiğinde ilerleme grafikleri burada görünür.
          </p>
        </ClientWorkspaceSection>
      )}
    </div>
  )
}

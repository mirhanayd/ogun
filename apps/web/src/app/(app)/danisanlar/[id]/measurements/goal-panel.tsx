'use client'

import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { TriangleAlert } from 'lucide-react'
import {
  calculateGoalProgressPercent,
  calculateTrailingSlope,
  checkMeasuredWeeklyLossSafety,
  projectGoalReachDate,
  type TimeSeriesPoint,
} from '@ogun/nutrition-core'
import type { GoalType } from '@ogun/db/schema'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  GOAL_TYPE_OPTIONS,
  goalFormSchema,
  type GoalFormValues,
} from '@/lib/validation/measurement-schemas'
import type { ChartMeasurement } from './progress-charts'

export interface ActiveGoalRow {
  id: string
  type: GoalType
  targetValue: number
  targetDate: string | null
  startValue: number
  startedAt: string
}

// GÖREV 4 — Hedef takibi. "çevre" hedef tipi HANGİ çevre ölçüsünü hedeflediğini
// belirtmiyor (roadmap sadece type: 'çevre' diyor, alt-metrik yok) — bu MVP'de
// BİLEREK bel çevresi (waistCm) varsayılıyor, çünkü klinik pratikte en sık
// takip edilen çevre ölçüsü budur. Bu bir ÜRÜN VARSAYIMI, PR açıklamasında da
// not edildi; ileride hedef oluşturma formuna "hangi çevre" seçimi eklenmesi
// gerekebilir.
const METRIC_FIELD: Record<GoalType, keyof ChartMeasurement> = {
  kilo: 'weightKg',
  yağ_oranı: 'bodyFatPct',
  çevre: 'waistCm',
}
const METRIC_UNIT: Record<GoalType, string> = { kilo: 'kg', yağ_oranı: '%', çevre: 'cm' }

function formatDateTr(iso: string): string {
  return new Date(iso).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function GoalPanel({
  clientId,
  activeGoals,
  measurements,
  onCreateGoal,
  onAchieveGoal,
}: {
  clientId: string
  activeGoals: ActiveGoalRow[]
  measurements: ChartMeasurement[]
  onCreateGoal: (values: GoalFormValues) => Promise<{ success: boolean; error?: string }>
  onAchieveGoal: (goalId: string) => Promise<{ success: boolean; error?: string }>
}) {
  return (
    <div className="flex flex-col gap-3">
      {GOAL_TYPE_OPTIONS.map((option) => {
        const goal = activeGoals.find((g) => g.type === option.value) ?? null
        return (
          <GoalCard
            key={option.value}
            clientId={clientId}
            type={option.value}
            goal={goal}
            measurements={measurements}
            onCreateGoal={onCreateGoal}
            onAchieveGoal={onAchieveGoal}
          />
        )
      })}
    </div>
  )
}

function GoalCard({
  clientId,
  type,
  goal,
  measurements,
  onCreateGoal,
  onAchieveGoal,
}: {
  clientId: string
  type: GoalType
  goal: ActiveGoalRow | null
  measurements: ChartMeasurement[]
  onCreateGoal: (values: GoalFormValues) => Promise<{ success: boolean; error?: string }>
  onAchieveGoal: (goalId: string) => Promise<{ success: boolean; error?: string }>
}) {
  const [creating, setCreating] = useState(false)

  const series: TimeSeriesPoint[] = useMemo(() => {
    const field = METRIC_FIELD[type]
    return measurements
      .filter((m) => m[field] !== null)
      .map((m) => ({ date: new Date(m.measuredAt), value: Number(m[field]) }))
  }, [measurements, type])

  const currentValue = series.length > 0 ? series[series.length - 1]!.value : null
  const slope = calculateTrailingSlope(series)
  const progressPercent =
    goal && currentValue !== null
      ? calculateGoalProgressPercent(goal.startValue, currentValue, goal.targetValue)
      : null
  const projectedDate =
    goal && currentValue !== null && slope !== null
      ? projectGoalReachDate(currentValue, goal.targetValue, slope)
      : null
  // GÜVENLİK (GÖREV 4): sadece 'kilo' tipi için haftalık >1kg kayıp uyarısı —
  // yüzde/cm birimlerinde bu eşik anlamsız (bkz. goal-projection.ts
  // checkMeasuredWeeklyLossSafety, kg birimine göre tanımlı).
  const safetyWarnings =
    type === 'kilo' && slope !== null ? checkMeasuredWeeklyLossSafety(slope) : []

  async function handleAchieve() {
    if (!goal) return
    await onAchieveGoal(goal.id)
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">
            {GOAL_TYPE_OPTIONS.find((o) => o.value === type)?.label}
          </p>
          {goal && (
            <Button type="button" variant="ghost" size="sm" onClick={handleAchieve}>
              Hedefe ulaşıldı olarak işaretle
            </Button>
          )}
        </div>

        {goal ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {goal.startValue} {METRIC_UNIT[type]} → {goal.targetValue} {METRIC_UNIT[type]}
                {goal.targetDate ? ` · hedef tarih ${formatDateTr(goal.targetDate)}` : ''}
              </span>
              {progressPercent !== null && (
                <span className="font-medium">%{progressPercent.toFixed(0)}</span>
              )}
            </div>
            {progressPercent !== null && (
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              {projectedDate
                ? `Son 4 haftalık trende göre tahmini hedefe varış: ${formatDateTr(projectedDate.toISOString())}`
                : 'Tahmini hedefe varış tarihi için yeterli veri yok (son 4 haftada en az 2 ölçüm gerekir).'}
            </p>

            {safetyWarnings.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-sm text-destructive">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <span>{safetyWarnings[0]!.message}</span>
              </div>
            )}
          </div>
        ) : creating ? (
          <NewGoalForm type={type} onCreateGoal={onCreateGoal} onDone={() => setCreating(false)} />
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Aktif hedef yok.</p>
            <Button type="button" variant="outline" size="sm" onClick={() => setCreating(true)}>
              Hedef belirle
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function NewGoalForm({
  type,
  onCreateGoal,
  onDone,
}: {
  type: GoalType
  onCreateGoal: (values: GoalFormValues) => Promise<{ success: boolean; error?: string }>
  onDone: () => void
}) {
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<GoalFormValues>({
    resolver: zodResolver(goalFormSchema),
    defaultValues: { type, targetValue: '', targetDate: '', startValue: '' },
  })

  async function onSubmit(values: GoalFormValues) {
    setFormError(null)
    const result = await onCreateGoal(values)
    if (!result.success) {
      setFormError(result.error ?? 'Kaydedilemedi, lütfen tekrar deneyin.')
      return
    }
    onDone()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-3">
      <input type="hidden" {...register('type')} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${type}-startValue`}>Başlangıç değeri ({METRIC_UNIT[type]})</Label>
          <Input
            id={`${type}-startValue`}
            type="number"
            step="0.1"
            aria-invalid={!!errors.startValue}
            {...register('startValue')}
          />
          {errors.startValue && (
            <p className="text-sm text-destructive">{errors.startValue.message}</p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${type}-targetValue`}>Hedef değer ({METRIC_UNIT[type]})</Label>
          <Input
            id={`${type}-targetValue`}
            type="number"
            step="0.1"
            aria-invalid={!!errors.targetValue}
            {...register('targetValue')}
          />
          {errors.targetValue && (
            <p className="text-sm text-destructive">{errors.targetValue.message}</p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${type}-targetDate`}>Hedef tarih (opsiyonel)</Label>
          <Input id={`${type}-targetDate`} type="date" {...register('targetDate')} />
        </div>
      </div>
      {formError && <p className="text-sm text-destructive">{formError}</p>}
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting ? 'Kaydediliyor…' : 'Hedefi kaydet'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Vazgeç
        </Button>
      </div>
    </form>
  )
}

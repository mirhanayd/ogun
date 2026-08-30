import { getClientActiveGoal, listClientMeasurements } from './queries'
import type { ChartMeasurement } from './progress-charts'
import type { ActiveGoalRow } from './goal-panel'
import { achieveGoalAction, createGoalAction, createMeasurementAction } from './actions'
import { MeasurementsView } from '@/screens/measurements-view'

export async function MeasurementsTab({ clientId }: { clientId: string }) {
  const [rows, weightGoal, bodyFatGoal, circumferenceGoal] = await Promise.all([listClientMeasurements(clientId, {}), getClientActiveGoal(clientId, 'kilo'), getClientActiveGoal(clientId, 'yağ_oranı'), getClientActiveGoal(clientId, 'çevre')])
  const measurements: ChartMeasurement[] = rows.map((row) => ({ id: row.id, measuredAt: row.measuredAt.toISOString(), source: row.source, weightKg: row.weightKg !== null ? Number(row.weightKg) : null, heightCm: row.heightCm !== null ? Number(row.heightCm) : null, waistCm: row.waistCm !== null ? Number(row.waistCm) : null, hipCm: row.hipCm !== null ? Number(row.hipCm) : null, neckCm: row.neckCm !== null ? Number(row.neckCm) : null, armCm: row.armCm !== null ? Number(row.armCm) : null, thighCm: row.thighCm !== null ? Number(row.thighCm) : null, chestCm: row.chestCm !== null ? Number(row.chestCm) : null, bodyFatPct: row.bodyFatPct !== null ? Number(row.bodyFatPct) : null, notes: row.notes }))
  const goals: ActiveGoalRow[] = [weightGoal, bodyFatGoal, circumferenceGoal].filter((goal): goal is NonNullable<typeof goal> => goal !== null).map((goal) => ({ id: goal.id, type: goal.type, targetValue: Number(goal.targetValue), targetDate: goal.targetDate, startValue: Number(goal.startValue), startedAt: goal.startedAt.toISOString() }))
  async function onAchieveGoal(goalId: string) { 'use server'; return achieveGoalAction(goalId, clientId) }
  return <MeasurementsView clientId={clientId} measurements={measurements} activeGoals={goals} weightGoal={weightGoal ? { targetValue: Number(weightGoal.targetValue) } : null} onSaveMeasurement={createMeasurementAction.bind(null, clientId)} onCreateGoal={createGoalAction.bind(null, clientId)} onAchieveGoal={onAchieveGoal} />
}

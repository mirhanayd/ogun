import { notFound } from 'next/navigation'
import { addDayAction, addMealAction, getPlanTreeAction } from '@/app/(app)/planlar/actions'
import { PLAN_MEAL_TYPE_OPTIONS } from '@/lib/validation/plan-schemas'
import { viewClientRecord } from '@/lib/data-subject-rights'
import { PlanEditor } from './plan-editor'

// GitHub issue #25 / Prompt 5.3 — GÖREV 1: editör rotası
// /danisanlar/[id]/planlar/[planId]. #23'ün bıraktığı boşluk: bir plan
// oluşturulduğunda (createPlanAction) HENÜZ hiçbir gün/öğün YOK — plan
// editörünün "sol: öğün blokları listesi" gösterebilmesi için en az bir gün
// + roadmap'in tanımladığı 6 standart öğün (kahvaltı/ara1/öğle/ara2/akşam/
// gece) gerekiyor. Bu sayfa, plan İLK AÇILDIĞINDA (days.length === 0 ise)
// bunu TEK SEFERLİK, sunucu tarafında bootstrap eder — #23'ün addDay/addMeal
// action'larını ÇAĞIRIR, raw sorguyla bypass ETMEZ.
async function ensurePlanBootstrapped(planId: string) {
  const result = await getPlanTreeAction(planId)
  if (!result.success || !result.data) return null
  if (result.data.days.length > 0) return result.data

  const dayResult = await addDayAction(planId, { dayNumber: 1 })
  if (!dayResult.success || !dayResult.data) return result.data

  for (const [index, option] of PLAN_MEAL_TYPE_OPTIONS.entries()) {
    await addMealAction(dayResult.data.id, {
      mealType: option.value,
      name: option.label,
      sortOrder: index,
    })
  }

  const refreshed = await getPlanTreeAction(planId)
  return refreshed.success ? (refreshed.data ?? null) : null
}

export default async function PlanEditorPage({
  params,
}: {
  params: Promise<{ id: string; planId: string }>
}) {
  const { id, planId } = await params

  const [client, tree] = await Promise.all([viewClientRecord(id), ensurePlanBootstrapped(planId)])

  if (!client || client.deletedAt || !tree) {
    notFound()
  }
  // Bu rota bir DANIŞANIN planı için — şablon (clientId=null) veya başka bir
  // danışana ait bir plan buradan AÇILAMAZ (URL'i elle değiştirerek başka
  // danışanın planına erişim denemesi de burada engellenir).
  if (tree.plan.clientId !== id) {
    notFound()
  }

  return (
    <PlanEditor
      planId={tree.plan.id}
      clientId={id}
      planName={tree.plan.name}
      startDate={tree.plan.startDate}
      endDate={tree.plan.endDate}
      targetKcal={tree.plan.targetKcal}
      tree={tree}
    />
  )
}

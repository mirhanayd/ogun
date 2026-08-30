import { viewClientRecord } from '@/lib/data-subject-rights'
import { PlansScreen, type PlanScreenRow } from '@/screens/plans-screen'
import { listPlansAction } from './actions'

export default async function PlanlarPage() {
  const [plansResult, templatesResult] = await Promise.all([
    listPlansAction({ isTemplate: false }),
    listPlansAction({ clientId: null, isTemplate: true }),
  ])
  if (!plansResult.success) {
    return <PlansScreen plans={[]} templates={null} clientNames={{}} error={plansResult.error ?? 'Plan listenizi açarken beklenmeyen bir sorun oluştu.'} />
  }
  const plans = (plansResult.data ?? []) as PlanScreenRow[]
  const clientIds = [...new Set(plans.flatMap((plan) => plan.clientId ? [plan.clientId] : []))]
  const resolved = await Promise.all(clientIds.map(async (id) => [id, await viewClientRecord(id)] as const))
  const clientNames = Object.fromEntries(resolved.flatMap(([id, client]) => client && !client.deletedAt ? [[id, `${client.firstName} ${client.lastName}`]] : []))
  return <PlansScreen plans={plans} templates={templatesResult.success ? (templatesResult.data ?? []) as PlanScreenRow[] : null} clientNames={clientNames} />
}

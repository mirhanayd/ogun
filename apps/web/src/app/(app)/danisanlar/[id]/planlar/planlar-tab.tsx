import Link from 'next/link'
import { ClipboardList } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/empty-state'
import { PLAN_STATUS_LABELS_TR } from '@/lib/validation/plan-schemas'
import { listClientPlans } from './queries'
import { NewPlanButton } from './new-plan-button'

// "Planlar" sekmesinin gerçek içeriği (GitHub issue #25 / Prompt 5.3) —
// danisanlar/[id]/page.tsx'teki EmptyState stub'ının (bkz. o dosyanın
// "planlar" TabsContent'i) yerini alır. Gerçek editör
// /danisanlar/[id]/planlar/[planId] rotasında (bkz. o klasördeki page.tsx).
export async function PlanlarTab({ clientId }: { clientId: string }) {
  const plans = await listClientPlans(clientId)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Diyet planları</p>
        <NewPlanButton clientId={clientId} />
      </div>

      {plans.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Henüz plan yok"
          description="Bu danışan için ilk diyet planını oluşturarak başlayın."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {plans.map((plan) => (
            <Link key={plan.id} href={`/danisanlar/${clientId}/planlar/${plan.id}`}>
              <Card className="transition-colors hover:bg-muted/50">
                <CardContent className="flex items-center gap-3 py-3">
                  <ClipboardList className="size-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate text-sm font-medium">{plan.name}</span>
                  {plan.targetKcal !== null && (
                    <span className="text-xs text-muted-foreground">
                      {plan.targetKcal} kcal hedef
                    </span>
                  )}
                  <Badge variant={plan.status === 'aktif' ? 'default' : 'secondary'}>
                    {PLAN_STATUS_LABELS_TR[plan.status]}
                  </Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

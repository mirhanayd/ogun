import type { ReactNode } from 'react'
import { ClipboardList } from 'lucide-react'
import { OgunPlan } from '@/components/ogun-icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/empty-state'
import { NavigationLink } from '@/components/navigation-link'
import { PLAN_STATUS_LABELS_TR } from '@/lib/validation/plan-schemas'

export interface ClientPlanViewRow {
  id: string
  name: string
  targetKcal: number | null
  status: 'taslak' | 'aktif' | 'arşiv'
  shareStatus?: ReactNode
}

export function ClientPlansView({
  clientId,
  plans,
  actions,
  rowAction,
  emptyAction,
}: {
  clientId: string
  plans: ClientPlanViewRow[]
  actions?: ReactNode
  rowAction?: (plan: ClientPlanViewRow) => ReactNode
  emptyAction?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-section">
          Beslenme planları{' '}
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {plans.length} kayıt
          </span>
        </h2>
        <div className="flex items-center gap-2">
          {actions ?? (
            <Button size="sm" disabled>
              Yeni plan
            </Button>
          )}
        </div>
      </div>
      {plans.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Henüz plan yok"
          description="Bu danışan için ilk diyet planını oluşturarak başlayın."
        >
          {emptyAction}
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-2">
          {plans.map((plan) => (
            <Card key={plan.id} className="py-0 transition-colors hover:bg-muted/50">
              <CardContent className="flex flex-wrap items-center gap-3 py-4">
                <NavigationLink
                  href={`/danisanlar/${clientId}/planlar/${plan.id}`}
                  className="flex min-w-0 flex-1 flex-wrap items-center gap-3 rounded-md"
                >
                  <OgunPlan className="size-5 shrink-0 text-muted-foreground" />
                  <span className="min-w-32 flex-1 break-words text-sm font-medium">
                    {plan.name}
                  </span>
                  {plan.targetKcal !== null ? (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {plan.targetKcal} kcal hedef
                    </span>
                  ) : null}
                  <Badge variant={plan.status === 'aktif' ? 'default' : 'secondary'}>
                    {PLAN_STATUS_LABELS_TR[plan.status]}
                  </Badge>
                  {plan.shareStatus}
                </NavigationLink>
                {rowAction?.(plan)}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

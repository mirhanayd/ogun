import type { ReactNode } from 'react'
import { ClipboardList } from 'lucide-react'
import { OgunPlan } from '@/components/ogun-icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/empty-state'
import { NavigationLink } from '@/components/navigation-link'
import { ClientWorkspaceHeader } from '@/screens/client-workspace'
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
    <div className="flex flex-col gap-6">
      <ClientWorkspaceHeader
        icon={OgunPlan}
        title="Beslenme planları"
        description="Danışanın planlarını oluşturun, paylaşım durumunu izleyin ve mevcut planlardan kopya alın."
        meta={`${plans.length} kayıt`}
        actions={
          actions ?? (
            <Button size="sm" disabled>
              Yeni plan
            </Button>
          )
        }
      />
      {plans.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Henüz plan yok"
          description="Bu danışan için ilk diyet planını oluşturarak başlayın."
        >
          {emptyAction}
        </EmptyState>
      ) : (
        <div className="divide-y divide-border border-y border-border">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className="flex flex-wrap items-center gap-3 py-4 transition-colors hover:bg-muted/30"
            >
              <NavigationLink
                href={`/danisanlar/${clientId}/planlar/${plan.id}`}
                className="group flex min-h-11 min-w-0 flex-1 flex-wrap items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                    <OgunPlan className="size-[1.125rem]" aria-hidden="true" />
                </span>
                <span className="min-w-32 flex-1 break-words text-sm font-semibold">
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
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

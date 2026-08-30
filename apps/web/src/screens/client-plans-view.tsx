import type { ReactNode } from 'react'
import { ClipboardList } from 'lucide-react'
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
  return <div className="flex flex-col gap-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm font-medium">Diyet planları</p>
      <div className="flex items-center gap-2">{actions ?? <Button size="sm" disabled>Yeni plan</Button>}</div>
    </div>
    {plans.length === 0 ? <EmptyState icon={ClipboardList} title="Henüz plan yok" description="Bu danışan için ilk diyet planını oluşturarak başlayın.">{emptyAction}</EmptyState> : <div className="flex flex-col gap-2">
      {plans.map((plan) => <Card key={plan.id} className="transition-colors hover:bg-muted/50"><CardContent className="flex items-center gap-3 py-3">
        <NavigationLink href={`/danisanlar/${clientId}/planlar/${plan.id}`} className="flex flex-1 items-center gap-3 overflow-hidden">
          <ClipboardList className="size-4 shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate text-sm font-medium">{plan.name}</span>
          {plan.targetKcal !== null ? <span className="shrink-0 text-xs text-muted-foreground">{plan.targetKcal} kcal hedef</span> : null}
          <Badge variant={plan.status === 'aktif' ? 'default' : 'secondary'}>{PLAN_STATUS_LABELS_TR[plan.status]}</Badge>
          {plan.shareStatus}
        </NavigationLink>
        {rowAction?.(plan)}
      </CardContent></Card>)}
    </div>}
  </div>
}

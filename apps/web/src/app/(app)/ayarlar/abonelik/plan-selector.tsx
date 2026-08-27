'use client'

import { useState, useTransition } from 'react'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PLAN_DEFINITIONS } from '@/lib/subscription/plans'
import type { SubscriptionPlan } from '@ogun/db/schema'
import { selectSubscriptionPlanAction } from './actions'

// GitHub issue #41 / Prompt 7.3, GÖREV 1 — plan kartları + seçim. Manuel
// sağlayıcı (bkz. lib/subscription/payment-provider/manual-provider.ts)
// checkoutUrl DÖNMEDİĞİ için burada bir "ödeme sayfasına yönlendirme" YOK —
// buton tıklanınca action DOĞRUDAN aboneliği aktif eder (bkz. actions.ts
// selectSubscriptionPlanAction notu, "gerçek entegrasyon pilot sonrası").
export function PlanSelector({ currentPlan }: { currentPlan: SubscriptionPlan | null }) {
  const [isPending, startTransition] = useTransition()
  const [pendingPlan, setPendingPlan] = useState<SubscriptionPlan | null>(null)
  const [error, setError] = useState<string | null>(null)

  function handleSelect(planCode: SubscriptionPlan) {
    setError(null)
    setPendingPlan(planCode)
    startTransition(async () => {
      if (planCode === 'kurumsal') return
      const result = await selectSubscriptionPlanAction({ planCode, billingCycle: 'monthly' })
      if (!result.success) {
        setError(result.error ?? 'Plan seçilemedi, lütfen tekrar deneyin.')
      }
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Object.values(PLAN_DEFINITIONS).map((plan) => {
          if (plan.code === 'kurumsal') return null
          const isCurrent = currentPlan === plan.code
          return (
            <Card key={plan.code} className={isCurrent ? 'border-primary' : undefined}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{plan.label}</CardTitle>
                  {isCurrent && (
                    <Badge variant="secondary" className="gap-1">
                      <Check className="size-3" /> Mevcut plan
                    </Badge>
                  )}
                </div>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-1 text-sm text-muted-foreground">
                <span>Danışan: {plan.limits.maxClients ?? 'Sınırsız'}</span>
                <span>Kullanıcı: {plan.limits.maxUsers}</span>
                <span>SMS/ay: {plan.limits.smsQuotaPerMonth}</span>
              </CardContent>
              <CardFooter>
                <Button
                  size="sm"
                  variant={isCurrent ? 'outline' : 'default'}
                  disabled={isPending || isCurrent}
                  onClick={() => handleSelect(plan.code)}
                >
                  {isPending && pendingPlan === plan.code ? 'Uygulanıyor…' : isCurrent ? 'Seçili' : 'Bu planı seç'}
                </Button>
              </CardFooter>
            </Card>
          )
        })}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

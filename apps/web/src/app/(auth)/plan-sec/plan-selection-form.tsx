'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PLAN_DEFINITIONS } from '@/lib/subscription/plans'
import { saveRequiredPlanSelectionAction } from './actions'

type PlanCode = 'başlangıç' | 'klinik'
type BillingCycle = 'monthly' | 'yearly'

const planCodes: PlanCode[] = ['başlangıç', 'klinik']

function money(value: number) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(value)
}

export function PlanSelectionForm({
  initialPlan,
  initialCycle,
}: {
  initialPlan?: PlanCode
  initialCycle?: BillingCycle
}) {
  const router = useRouter()
  const [planCode, setPlanCode] = useState<PlanCode>(initialPlan ?? 'başlangıç')
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(initialCycle ?? 'monthly')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 rounded-xl bg-muted p-1" role="radiogroup" aria-label="Ödeme dönemi">
        {(['monthly', 'yearly'] as const).map((cycle) => (
          <button
            key={cycle}
            type="button"
            role="radio"
            aria-checked={billingCycle === cycle}
            onClick={() => setBillingCycle(cycle)}
            className={cn(
              'rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors',
              billingCycle === cycle ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground',
            )}
          >
            {cycle === 'monthly' ? 'Aylık' : 'Yıllık peşin'}
          </button>
        ))}
      </div>

      <div className="grid gap-4" role="radiogroup" aria-label="Abonelik planı">
        {planCodes.map((code) => {
          const plan = PLAN_DEFINITIONS[code]
          const selected = planCode === code
          const price = plan.prices[billingCycle]
          return (
            <button
              key={code}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setPlanCode(code)}
              className={cn(
                'relative flex min-h-64 flex-col rounded-2xl border p-5 text-left transition-all',
                selected ? 'border-primary bg-primary/[0.04] ring-2 ring-primary/15' : 'border-border bg-card hover:border-primary/40',
              )}
            >
              {selected && <Check className="absolute top-4 right-4 size-5 text-primary" aria-hidden="true" />}
              <Users className="mb-4 size-6 text-primary" aria-hidden="true" />
              <span className="pr-7 text-lg font-semibold">{plan.label}</span>
              <span className="mt-2 text-sm leading-6 text-muted-foreground">{plan.description}</span>
              <span className="mt-auto pt-6 text-3xl font-semibold tracking-tight">{money(price)}</span>
              <span className="mt-1 text-xs text-muted-foreground">
                {billingCycle === 'monthly' ? 'her ay' : 'yıllık peşin ödeme'}
              </span>
            </button>
          )
        })}
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button
        className="h-12 rounded-xl"
        disabled={isPending}
        onClick={() => startTransition(async () => {
          setError(null)
          const result = await saveRequiredPlanSelectionAction({ planCode, billingCycle })
          if (!result.success) return setError(result.error)
          router.push('/kurulum')
          router.refresh()
        })}
      >
        {isPending ? 'Plan kaydediliyor…' : 'Bu planla devam et'}
      </Button>
      <p className="text-center text-xs leading-5 text-muted-foreground">
        Klinik kurulumu tamamlandıktan sonra güvenli iyzico ödeme ekranına yönlendirileceksiniz.
      </p>
    </div>
  )
}

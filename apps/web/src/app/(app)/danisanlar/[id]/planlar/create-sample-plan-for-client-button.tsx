'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { createDurationTracker } from '@/lib/analytics/track'
import { createSamplePlanForClientAction } from '@/app/(app)/danisanlar/onboarding-actions'

// GitHub issue #47 / Prompt 8.3, GÖREV 1 — "boş durumlarda 'örnek plan
// oluştur' butonu", BU danışanın "Planlar" sekmesi boşken (bkz.
// planlar-tab.tsx EmptyState). Danışan zaten biliniyor (clientId), sadece
// planı oluşturur — create-sample-plan-button.tsx'in (danisanlar/page.tsx,
// klinikte HİÇ danışan yokken) daha dar kapsamlı eşleniği.
export function CreateSamplePlanForClientButton({ clientId }: { clientId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)

  function handleClick() {
    setBusy(true)
    const tracker = createDurationTracker()
    startTransition(async () => {
      const result = await createSamplePlanForClientAction(clientId)
      setBusy(false)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      tracker.finish('sample_plan_created', '/danisanlar/[id]/planlar')
      router.push(`/danisanlar/${clientId}/planlar/${result.planId}`)
    })
  }

  return (
    <Button variant="outline" size="sm" onClick={handleClick} disabled={isPending || busy}>
      <Sparkles className="size-4" />
      Örnek plan oluştur
    </Button>
  )
}

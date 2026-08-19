'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { toastActionError } from '@/lib/action-toast'
import { Button } from '@/components/ui/button'
import { createDurationTracker } from '@/lib/analytics/track'
import { createSampleClientAndPlanAction } from './onboarding-actions'

// GitHub issue #47 / Prompt 8.3, GÖREV 1 — "boş durumlarda 'örnek plan
// oluştur' butonu", klinikte HİÇ danışan yokken (bkz. page.tsx EmptyState).
export function CreateSamplePlanButton() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)

  function handleClick() {
    setBusy(true)
    const tracker = createDurationTracker()
    startTransition(async () => {
      const result = await createSampleClientAndPlanAction()
      setBusy(false)
      if (!result.success) {
        toastActionError(result.error, 'Örnek veri oluşturulamadı. Sayfayı yenileyip tekrar deneyin.')
        return
      }
      tracker.finish('sample_plan_created', '/danisanlar')
      router.push(`/danisanlar/${result.clientId}/planlar/${result.planId}`)
    })
  }

  return (
    <Button variant="outline" size="sm" onClick={handleClick} disabled={isPending || busy}>
      <Sparkles className="size-4" />
      Örnek danışan ve plan oluştur
    </Button>
  )
}

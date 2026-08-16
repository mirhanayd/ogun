'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { createPlanAction } from '@/app/(app)/planlar/actions'

// GitHub issue #25 — "Bu şablondan plan oluştur" / şablon kütüphanesi
// Prompt 5.5'in kapsamı; burada SADECE en basit akış var: boş bir günlük
// plan oluştur, editöre git. Plan editörünün BOOTSTRAP mantığı (gün +
// 6 standart öğün) [planId]/page.tsx'te (ensurePlanBootstrapped).
export function NewPlanButton({ clientId, className }: { clientId: string; className?: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)

  function handleClick() {
    setBusy(true)
    startTransition(async () => {
      const result = await createPlanAction({
        clientId,
        name: `Yeni plan — ${new Date().toLocaleDateString('tr-TR')}`,
        planType: 'günlük',
        status: 'taslak',
      })
      setBusy(false)
      if (!result.success || !result.data) {
        toast.error(result.error ?? 'Plan oluşturulamadı.')
        return
      }
      router.push(`/danisanlar/${clientId}/planlar/${result.data.id}`)
    })
  }

  return (
    <Button
      size="sm"
      onClick={handleClick}
      disabled={isPending || busy}
      className={className ?? 'gap-1.5'}
    >
      <Plus className="size-4" />
      Yeni plan
    </Button>
  )
}

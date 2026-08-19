'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, Loader2 } from 'lucide-react'
import { toastActionError } from '@/lib/action-toast'
import { Button } from '@/components/ui/button'
import { duplicatePlanAction } from '@/app/(app)/planlar/actions'

// GitHub issue #27 / Prompt 5.5, GÖREV 2 — "Bu planı kopyala ve düzenle".
// Spec'in kendi ifadesiyle "en sık kullanılacak akış bu olacak, 2 tıktan
// fazla sürmesin": TEK bir tık (bu buton) → duplicatePlanAction (#23'ün
// hazır klonlama mantığı) → editöre YÖNLENDİRME. İkinci "tık" YOK, planlar-tab
// listesindeki her satırın kendi ayrı butonu bu — Link'in İÇİNE
// KONULMADI (stopPropagation ile), çünkü satırın kendisi ZATEN "bu planı AÇ"
// anlamına geliyor (bkz. planlar-tab.tsx), kopyalama FARKLI bir eylem.
export function CopyPlanButton({ clientId, planId }: { clientId: string; planId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleClick(event: React.MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    startTransition(async () => {
      const result = await duplicatePlanAction(planId)
      if (!result.success || !result.data) {
        toastActionError(result.error ?? 'Plan kopyalanamadı.', 'Kaynak plan silinmiş olabilir; listeyi yenileyip tekrar deneyin.')
        return
      }
      router.push(`/danisanlar/${clientId}/planlar/${result.data.id}`)
    })
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="gap-1.5"
      disabled={isPending}
      onClick={handleClick}
    >
      {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Copy className="size-3.5" />}
      Kopyala ve düzenle
    </Button>
  )
}

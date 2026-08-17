'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { confirmClientConsentAction } from '../ice-aktar/actions'

// GitHub issue #47 / Prompt 8.3, GÖREV 3 — CSV içe aktarmayla "rıza bekliyor"
// durumunda oluşturulan bir danışanın rızasının SONRADAN onaylanması (bkz.
// packages/db/src/queries/clients.ts confirmClientConsent dosya başı notu).
export function ConfirmConsentButton({ clientId }: { clientId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      const result = await confirmClientConsentAction(clientId)
      if (!result.success) {
        toast.error(result.error ?? 'Rıza onaylanamadı.')
        return
      }
      toast.success('Rıza onaylandı.')
      router.refresh()
    })
  }

  return (
    <Button size="sm" variant="outline" onClick={handleClick} disabled={isPending}>
      {isPending ? 'Onaylanıyor…' : 'Rızayı onayla'}
    </Button>
  )
}

'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { cancelSubscriptionAction, runSmsReminderSweepAction } from './actions'

// GitHub issue #41 / Prompt 7.3 — abonelik iptali (GÖREV 1) VE SMS
// hatırlatma sweep'inin manuel tetikleyicisi (GÖREV 3, bkz. actions.ts
// runSmsReminderSweepAction dosya başı notu — bu repoda gerçek bir
// cron/zamanlayıcı henüz kurulu değil).
export function CancelSubscriptionButton({ hasActiveSubscription }: { hasActiveSubscription: boolean }) {
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  if (!hasActiveSubscription) return null

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const result = await cancelSubscriptionAction()
            setMessage(result.success ? 'Abonelik iptal edildi.' : (result.error ?? 'İptal edilemedi.'))
          })
        }
      >
        {isPending ? 'İptal ediliyor…' : 'Aboneliği iptal et'}
      </Button>
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </div>
  )
}

export function RunSmsSweepButton() {
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const result = await runSmsReminderSweepAction()
            if (!result.success) {
              setMessage(result.error ?? 'Çalıştırılamadı.')
              return
            }
            const r = result.result
            setMessage(
              r
                ? `Tamamlandı: ${r.sent} gönderildi, ${r.skippedNoConsent} rıza yok, ${r.skippedOther} atlandı, ${r.errors} hata.`
                : 'Tamamlandı.',
            )
          })
        }
      >
        {isPending ? 'Çalıştırılıyor…' : 'SMS hatırlatmalarını şimdi gönder'}
      </Button>
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </div>
  )
}

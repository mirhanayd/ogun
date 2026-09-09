'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'

export function InvitationAccountSwitch({ next }: { next: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  return (
    <Button
      className="w-full"
      variant="outline"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        await authClient.signOut()
        router.push(`/giris?next=${encodeURIComponent(next)}`)
        router.refresh()
      }}
    >
      {busy ? 'Çıkış yapılıyor…' : 'Çıkış yap ve doğru hesapla giriş yap'}
    </Button>
  )
}

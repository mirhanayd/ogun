'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Building2 } from 'lucide-react'
import type { ClinicMembership } from '@ogun/db/queries'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { selectClinicAction } from './actions'

const ROLE_LABELS: Record<string, string> = {
  owner: 'Klinik sahibi',
  dietitian: 'Diyetisyen',
  assistant: 'Asistan',
}

// GitHub issue #67 — klinik seçim ekranı. Üst bardaki klinik seçiciyle (bkz.
// (app)/_components/clinic-switcher-menu.tsx) AYNI veriyi gösterir; fark,
// oradaki menünün ZATEN aktif bir klinik varken çalışması, buranın ise
// "hiç seçilmemiş" durumu çözmesi.
export function ClinicPicker({ memberships }: { memberships: ClinicMembership[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSelect(clinicId: string) {
    setError(null)
    startTransition(async () => {
      const result = await selectClinicAction(clinicId)
      if (!result.success) {
        setError(result.error ?? 'Klinik seçilemedi. Sayfayı yenileyip tekrar deneyin.')
        return
      }
      router.push('/panel')
      router.refresh()
    })
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Hangi klinikle devam edeceksiniz?</CardTitle>
        <CardDescription>
          Birden fazla klinikte üyeliğiniz var. Seçiminizi daha sonra üst bardaki klinik
          seçiciden değiştirebilirsiniz.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {memberships.map((membership) => (
          <button
            key={membership.clinicId}
            type="button"
            disabled={isPending}
            onClick={() => handleSelect(membership.clinicId)}
            className="flex items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-accent disabled:opacity-60"
          >
            <Avatar size="sm">
              {membership.logoUrl && <AvatarImage src={membership.logoUrl} alt="" />}
              <AvatarFallback>
                <Building2 className="size-3.5" />
              </AvatarFallback>
            </Avatar>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-body font-medium">{membership.clinicName}</span>
              <span className="text-helper text-muted-foreground">
                {ROLE_LABELS[membership.role] ?? membership.role}
              </span>
            </span>
          </button>
        ))}
        {error && <p className="text-body text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}

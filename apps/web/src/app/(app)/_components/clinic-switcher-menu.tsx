'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, ChevronsUpDown } from 'lucide-react'
import type { ClinicMembership } from '@ogun/db/queries'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { switchClinicAction } from '../actions'

export function ClinicSwitcherMenu({
  memberships,
  activeClinicId,
}: {
  memberships: ClinicMembership[]
  activeClinicId: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const active = memberships.find((m) => m.clinicId === activeClinicId) ?? memberships[0]

  function handleSelect(clinicId: string) {
    if (clinicId === activeClinicId) return
    setError(null)
    startTransition(async () => {
      const result = await switchClinicAction(clinicId)
      if (!result.success) {
        setError(result.error ?? 'Klinik değiştirilemedi.')
        return
      }
      router.refresh()
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 px-1.5" disabled={isPending}>
          <Avatar size="sm">
            {active?.logoUrl && <AvatarImage src={active.logoUrl} alt="" />}
            <AvatarFallback>
              <Building2 className="size-3.5" />
            </AvatarFallback>
          </Avatar>
          <span className="max-w-40 truncate">{active?.clinicName ?? 'Klinik seçin'}</span>
          <ChevronsUpDown className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Klinikleriniz</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {memberships.map((membership) => (
          <DropdownMenuItem key={membership.clinicId} onSelect={() => handleSelect(membership.clinicId)}>
            <Building2 className="size-4" />
            <span className="truncate">{membership.clinicName}</span>
          </DropdownMenuItem>
        ))}
        {error && <p className="px-1.5 py-1 text-xs text-destructive">{error}</p>}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

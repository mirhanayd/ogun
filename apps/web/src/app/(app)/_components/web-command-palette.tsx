'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { ClinicMemberRole } from '@ogun/db/schema'
import { searchClientsAction } from '@/app/(app)/randevular/actions'
import { CommandPaletteView } from './command-palette'

export function CommandPalette({ role }: { role: ClinicMemberRole }) {
  const router = useRouter()
  const navigate = useCallback((href: string) => router.push(href), [router])
  return <CommandPaletteView role={role} onNavigate={navigate} searchClients={searchClientsAction} />
}

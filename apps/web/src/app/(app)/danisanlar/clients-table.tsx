'use client'

import { useRouter } from 'next/navigation'
import type { ClinicDietitianOption, ListClientsResult } from '@ogun/db/queries'
import type { ClinicMemberRole } from '@ogun/db/schema'
import {
  ClientsTableView,
  type ClientAttentionIndicator,
  type ClientsFilters,
} from '@/screens/clients-table-view'
import { archiveClientsAction, assignDietitianAction } from './actions'
import { ClientRowActions } from './client-row-actions'

function queryString(filters: ClientsFilters, page: number) {
  const params = new URLSearchParams()
  if (filters.search) params.set('q', filters.search)
  if (filters.status) params.set('status', filters.status)
  if (filters.assignedDietitianId) params.set('dietitian', filters.assignedDietitianId)
  if (page > 1) params.set('page', String(page))
  const value = params.toString()
  return value ? `?${value}` : ''
}

export function ClientsTable({
  result,
  dietitians,
  role,
  filters,
  attentionByClient,
}: {
  result: ListClientsResult
  dietitians: ClinicDietitianOption[]
  role: ClinicMemberRole
  filters: ClientsFilters
  attentionByClient: Record<string, ClientAttentionIndicator>
}) {
  const router = useRouter()
  return (
    <ClientsTableView
      result={result}
      dietitians={dietitians}
      role={role}
      filters={filters}
      attentionByClient={attentionByClient}
      renderRowActions={(client) => <ClientRowActions client={client} dietitians={dietitians} />}
      onNavigate={(next, page) => router.push(`/danisanlar${queryString(next, page)}`)}
      onArchive={async (ids) => {
        const result = await archiveClientsAction(ids)
        if (result.success) router.refresh()
        return result
      }}
      onAssign={async (ids, dietitianId) => {
        const result = await assignDietitianAction(ids, dietitianId)
        if (result.success) router.refresh()
        return result
      }}
    />
  )
}

export type { ClientsFilters } from '@/screens/clients-table-view'

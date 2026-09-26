'use server'

import { listClientsForClinic } from '@/app/(app)/danisanlar/queries'
import type { SidebarQuickClient } from '@/components/app-shell-views'

export async function listSidebarQuickClients(): Promise<SidebarQuickClient[]> {
  const result = await listClientsForClinic({ status: 'aktif', pageSize: 4 })
  return result.rows.map(({ id, firstName, lastName }) => ({ id, firstName, lastName }))
}

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ClinicMemberRole } from '@ogun/db/schema'
import { SidebarNavView, type ShellLinkProps } from '@/components/app-shell-views'
import { useConnectivityStatus } from '@/components/connectivity-status-provider'

function NextShellLink(props: ShellLinkProps) { return <Link {...props} /> }

export function SidebarNav({ role }: { role: ClinicMemberRole }) {
  return <SidebarNavView role={role} currentPath={usePathname()} connectivity={useConnectivityStatus()} LinkComponent={NextShellLink} />
}

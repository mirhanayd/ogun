'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ClinicMemberRole } from '@ogun/db/schema'
import { BottomNavView, type ShellLinkProps } from '@/components/app-shell-views'

function NextShellLink(props: ShellLinkProps) { return <Link {...props} /> }

export function BottomNav({ role }: { role: ClinicMemberRole }) {
  return <BottomNavView role={role} currentPath={usePathname()} LinkComponent={NextShellLink} />
}

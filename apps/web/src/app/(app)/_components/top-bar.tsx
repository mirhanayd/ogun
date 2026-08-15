import { Suspense } from 'react'
import type { ClinicMemberRole } from '@ogun/db/schema'
import { ClinicSwitcher } from './clinic-switcher'
import { ClinicSwitcherSkeleton } from './clinic-switcher-skeleton'
import { CommandPalette } from './command-palette'
import { UserMenu } from './user-menu'

export function TopBar({
  activeClinicId,
  role,
  userName,
  userEmail,
}: {
  activeClinicId: string
  role: ClinicMemberRole
  userName: string
  userEmail: string
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
      <Suspense fallback={<ClinicSwitcherSkeleton />}>
        <ClinicSwitcher activeClinicId={activeClinicId} />
      </Suspense>
      <div className="flex flex-1 justify-center px-2 sm:justify-start">
        <CommandPalette role={role} />
      </div>
      <UserMenu name={userName} email={userEmail} />
    </header>
  )
}

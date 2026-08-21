import { Suspense } from 'react'
import type { ClinicMemberRole } from '@ogun/db/schema'
import { ClinicSwitcher } from './clinic-switcher'
import { ClinicSwitcherSkeleton } from './clinic-switcher-skeleton'
import { CommandPalette } from './command-palette'
import { FeedbackButton } from './feedback-button'
import { KeyboardShortcutsHelp } from './keyboard-shortcuts-help'
import { PageContext } from './page-context'
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
    <header className="app-topbar flex h-[4.5rem] shrink-0 items-center gap-4 border-b border-border/80 bg-background/90 px-4 backdrop-blur-xl sm:px-6">
      <PageContext />
      <div className="hidden h-7 w-px bg-border md:block" />
      <Suspense fallback={<ClinicSwitcherSkeleton />}>
        <ClinicSwitcher activeClinicId={activeClinicId} />
      </Suspense>
      <div className="app-topbar-search flex flex-1 justify-center px-2">
        <CommandPalette role={role} />
      </div>
      <div className="app-topbar-utility flex items-center gap-0.5">
        <KeyboardShortcutsHelp />
        <FeedbackButton />
        <div className="mx-1 h-6 w-px bg-border" />
        <UserMenu name={userName} email={userEmail} />
      </div>
    </header>
  )
}

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
    <header className="app-topbar flex h-[4.5rem] shrink-0 items-center gap-2 border-b border-border/80 bg-background/90 px-3 backdrop-blur-xl sm:gap-4 sm:px-6">
      <PageContext />
      <div className="hidden h-7 w-px bg-border md:block" />
      <div className="min-w-0 flex-1 sm:flex-none">
        <Suspense fallback={<ClinicSwitcherSkeleton />}>
          <ClinicSwitcher activeClinicId={activeClinicId} />
        </Suspense>
      </div>
      <div className="app-topbar-search flex flex-none justify-end sm:flex-1 sm:justify-center sm:px-2 [&_button]:size-9 [&_button]:justify-center [&_button]:px-0 [&_button_span]:sr-only sm:[&_button]:h-9 sm:[&_button]:w-full sm:[&_button]:justify-start sm:[&_button]:px-3 sm:[&_button_span]:not-sr-only">
        <CommandPalette role={role} />
      </div>
      <div className="app-topbar-utility flex items-center gap-0.5">
        <div className="hidden items-center gap-0.5 lg:flex">
          <KeyboardShortcutsHelp />
          <FeedbackButton />
        </div>
        <div className="mx-1 hidden h-6 w-px bg-border sm:block" />
        <UserMenu name={userName} email={userEmail} />
      </div>
    </header>
  )
}

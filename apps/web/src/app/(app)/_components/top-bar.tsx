import { Suspense } from 'react'
import type { ClinicMemberRole } from '@ogun/db/schema'
import { TopBarView } from '@/components/app-shell-views'
import { ClinicSwitcher } from './clinic-switcher'
import { ClinicSwitcherSkeleton } from './clinic-switcher-skeleton'
import { CommandPalette } from './command-palette'
import { FeedbackButton } from './feedback-button'
import { KeyboardShortcutsHelp } from './keyboard-shortcuts-help'
import { PageContext } from './page-context'
import { UserMenu } from './user-menu'

export function TopBar({ activeClinicId, role, userName, userEmail }: { activeClinicId: string; role: ClinicMemberRole; userName: string; userEmail: string }) {
  return <TopBarView pageContext={<PageContext />} clinicSwitcher={<Suspense fallback={<ClinicSwitcherSkeleton />}><ClinicSwitcher activeClinicId={activeClinicId} /></Suspense>} search={<CommandPalette role={role} />} utilities={<><KeyboardShortcutsHelp /><FeedbackButton /></>} userMenu={<UserMenu name={userName} email={userEmail} />} />
}

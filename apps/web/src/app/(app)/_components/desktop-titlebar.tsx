'use client'

import type { ClinicMemberRole } from '@ogun/db/schema'
import { DesktopTitlebarView } from '@/components/app-shell-views'
import { useDesktopWindowControls } from '@/components/use-desktop-window-controls'
import { CommandPalette } from './web-command-palette'
import { FeedbackButton } from './feedback-button'
import { KeyboardShortcutsHelp } from './keyboard-shortcuts-help'
import { UserMenu } from './user-menu'

export function DesktopTitlebar({ role, userName, userEmail }: { role: ClinicMemberRole; userName: string; userEmail: string }) {
  const { maximized, titlebarHandlers, withWindow } = useDesktopWindowControls()
  return <DesktopTitlebarView maximized={maximized} titlebarProps={titlebarHandlers} search={<CommandPalette role={role} />} utilities={<><KeyboardShortcutsHelp /><FeedbackButton /><UserMenu name={userName} email={userEmail} /></>} onMinimize={() => void withWindow('minimize')} onToggleMaximize={() => void withWindow('toggleMaximize')} onClose={() => void withWindow('close')} />
}

'use client'

import Image from 'next/image'
import { Maximize2, Minus, Square, X } from 'lucide-react'
import type { ClinicMemberRole } from '@ogun/db/schema'
import { useDesktopWindowControls } from '@/components/use-desktop-window-controls'
import { CommandPalette } from './command-palette'
import { FeedbackButton } from './feedback-button'
import { KeyboardShortcutsHelp } from './keyboard-shortcuts-help'
import { UserMenu } from './user-menu'

export function DesktopTitlebar({
  role,
  userName,
  userEmail,
}: {
  role: ClinicMemberRole
  userName: string
  userEmail: string
}) {
  const { maximized, titlebarHandlers, withWindow } = useDesktopWindowControls()

  return (
    <header
      {...titlebarHandlers}
      className="desktop-titlebar relative z-50 flex h-12 shrink-0 select-none items-center border-b border-white/10 bg-desktop-chrome text-white shadow-[0_1px_0_rgba(0,0,0,0.22)]"
    >
      <div className="flex w-60 shrink-0 items-center gap-2.5 px-4">
        {/* src-tauri/icons içindeki native uygulama ikonunun vektör karşılığı. */}
        <Image
          src="/brand/ogun-uygulama-ikonu.svg"
          alt=""
          width={28}
          height={28}
          className="size-7 shrink-0 rounded-lg shadow-sm"
        />
        <span className="text-sm font-semibold tracking-[-0.02em]">öğün</span>
        <span className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[9px] font-semibold tracking-[0.14em] text-emerald-100 uppercase">
          Desktop
        </span>
      </div>

      <div className="flex min-w-0 flex-1 justify-center px-4">
        <div className="w-full max-w-xl [&_button]:h-8 [&_button]:max-w-none [&_button]:border-white/15 [&_button]:bg-white/10 [&_button]:text-emerald-50 [&_button:hover]:bg-white/15 [&_kbd]:border-white/15 [&_kbd]:bg-black/15 [&_kbd]:text-emerald-100">
          <CommandPalette role={role} />
        </div>
      </div>

      <div className="flex h-full shrink-0 items-center gap-0.5 pl-2">
        <div className="flex items-center gap-0.5 pr-2 [&_button]:text-emerald-50 [&_button:hover]:bg-white/10">
          <KeyboardShortcutsHelp />
          <FeedbackButton />
          <UserMenu name={userName} email={userEmail} />
        </div>
        <div className="flex h-full border-l border-white/10">
          <WindowButton label="Küçült" onClick={() => void withWindow('minimize')}>
            <Minus />
          </WindowButton>
          <WindowButton
            label={maximized ? 'Önceki boyuta dön' : 'Büyüt'}
            onClick={() => void withWindow('toggleMaximize')}
          >
            {maximized ? <Square /> : <Maximize2 />}
          </WindowButton>
          <WindowButton label="Kapat" destructive onClick={() => void withWindow('close')}>
            <X />
          </WindowButton>
        </div>
      </div>
    </header>
  )
}

function WindowButton({
  label,
  destructive = false,
  onClick,
  children,
}: {
  label: string
  destructive?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`grid h-full w-11 place-items-center transition-colors [&_svg]:size-3.5 ${
        destructive ? 'hover:bg-red-500 hover:text-white' : 'hover:bg-white/10'
      }`}
    >
      {children}
    </button>
  )
}

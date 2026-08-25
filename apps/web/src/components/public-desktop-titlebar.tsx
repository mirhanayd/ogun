'use client'

import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { Maximize2, Minus, Square, X } from 'lucide-react'
import { useDesktopWindowControls } from '@/components/use-desktop-window-controls'

const APP_SHELL_PREFIXES = [
  '/panel',
  '/danisanlar',
  '/randevular',
  '/planlar',
  '/tarifler',
  '/finans',
  '/ayarlar',
]

export function PublicDesktopTitlebar() {
  const pathname = usePathname()
  const usesAuthenticatedTitlebar = APP_SHELL_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
  const { maximized, titlebarHandlers, withWindow } =
    useDesktopWindowControls(!usesAuthenticatedTitlebar)

  if (usesAuthenticatedTitlebar) return null

  return (
    <header
      {...titlebarHandlers}
      className="public-desktop-titlebar desktop-titlebar relative z-50 flex h-12 shrink-0 select-none items-center border-b border-white/10 bg-desktop-chrome text-white shadow-[0_1px_0_rgba(0,0,0,0.22)]"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5 px-4">
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

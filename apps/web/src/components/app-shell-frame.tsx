import type { CSSProperties, ReactNode } from 'react'

export interface AppShellFrameProps {
  clinicName: string
  clinicLogoUrl?: string | null
  clinicInitials: string
  userName: string
  brandingStyle?: CSSProperties
  desktopTitlebar: ReactNode
  navigation: ReactNode
  topbar: ReactNode
  bottomNavigation: ReactNode
  overlays?: ReactNode
  children: ReactNode
}

/** Shared visual frame used by the Next server composition and packaged UI. */
export function AppShellFrame({
  clinicName,
  clinicLogoUrl,
  clinicInitials,
  userName,
  brandingStyle,
  desktopTitlebar,
  navigation,
  topbar,
  bottomNavigation,
  overlays,
  children,
}: AppShellFrameProps) {
  return (
    <div
      className="flex h-svh min-h-0 flex-col overflow-hidden bg-background"
      data-app-shell
      data-clinic-branding
      style={brandingStyle}
    >
      {desktopTitlebar}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="app-sidebar hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
          <div className="flex h-[4.5rem] items-center gap-3 px-4">
            <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-sidebar-border bg-background/70 text-primary shadow-sm">
              {clinicLogoUrl ? (
                // Clinic logos may be data URLs, which image optimizers cannot handle.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={clinicLogoUrl} alt="" className="size-full object-contain" />
              ) : (
                <span className="text-sm font-semibold">{clinicInitials}</span>
              )}
            </span>
            <div className="min-w-0">
              <p
                className="truncate text-sm font-semibold tracking-[-0.025em] text-sidebar-foreground"
                title={clinicName}
              >
                {clinicName}
              </p>
              <p
                className="truncate text-[10px] font-medium tracking-[0.08em] text-muted-foreground"
                title={userName}
              >
                {userName}
              </p>
            </div>
          </div>
          {navigation}
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          {topbar}
          <main className="app-main flex-1 overflow-y-auto px-4 py-5 pb-20 sm:px-6 md:pb-7 lg:px-8">
            <div className="mx-auto w-full max-w-[1500px]">{children}</div>
          </main>
        </div>
      </div>
      {bottomNavigation}
      {overlays}
    </div>
  )
}

import type { CSSProperties, ReactNode } from 'react'
import { AppSidebar } from './app-sidebar'

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
        <AppSidebar
          identity={
            <div
              className="flex h-full min-w-0 items-center gap-3 px-3"
              title={`${clinicName} — ${userName}`}
            >
              <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-2xl border border-border/80 bg-card text-primary shadow-sm">
                {clinicLogoUrl ? (
                  // Clinic logos may be data URLs, which image optimizers cannot handle.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={clinicLogoUrl}
                    alt=""
                    width={44}
                    height={44}
                    className="size-full object-contain"
                  />
                ) : (
                  <span className="text-sm font-semibold">{clinicInitials}</span>
                )}
              </span>
              <div className="min-w-0">
                <p
                  className="truncate text-sm font-semibold tracking-[-0.025em] text-foreground"
                  title={clinicName}
                >
                  {clinicName}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground" title={userName}>
                  {userName}
                </p>
              </div>
            </div>
          }
        >
          {navigation}
        </AppSidebar>
        <div className="app-content-frame flex min-w-0 flex-1 flex-col">
          {topbar}
          <a href="#ogun-main" className="app-skip-link">
            İçeriğe geç
          </a>
          <main
            id="ogun-main"
            tabIndex={-1}
            className="app-main min-w-0 flex-1 overflow-y-auto px-4 py-5 pb-24 sm:px-6 md:pb-7 lg:px-8"
            data-app-main
          >
            <div className="mx-auto w-full max-w-[1500px]">{children}</div>
          </main>
        </div>
      </div>
      {bottomNavigation}
      {overlays}
    </div>
  )
}

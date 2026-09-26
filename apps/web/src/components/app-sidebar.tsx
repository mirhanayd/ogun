import type { ReactNode } from 'react'

export function AppSidebar({ identity, children }: { identity: ReactNode; children: ReactNode }) {
  return (
    <aside className="app-sidebar hidden shrink-0 md:block" data-app-sidebar>
      <div className="sidebar-identity" data-sidebar-identity>
        {identity}
      </div>
      <div className="app-navigation-flyout" data-navigation-flyout>
        {children}
      </div>
    </aside>
  )
}

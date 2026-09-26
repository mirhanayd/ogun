import { Search } from 'lucide-react'
import { useState } from 'react'
import { AppShellFrame } from '@/components/app-shell-frame'
import {
  BottomNavView,
  DesktopTitlebarView,
  SidebarNavView,
  TopBarView,
} from '@/components/app-shell-views'
import { NavigationProvider } from '@/components/navigation-link'
import {
  LocalClientsAdapter,
  LocalClientDetailAdapter,
  LocalNewClientAdapter,
} from './local-clients-adapter'
import { createLayoutFixtureRepositories } from './layout-fixture-repositories'
import type { ClinicRole, OgunRepositories } from '@/data/repositories'
import { PanelScreen, type PanelFeed } from '@/screens/panel-screen'
import { PlansScreen, type PlanScreenRow } from '@/screens/plans-screen'

const planRows: PlanScreenRow[] = [
  {
    id: 'plan-1',
    clientId: 'client-1',
    name: 'Dengeli Beslenme Programı',
    status: 'taslak',
    isTemplate: false,
    endDate: null,
    updatedAt: new Date('2026-08-29'),
    targetKcal: 1800,
  },
  {
    id: 'plan-2',
    clientId: 'client-2',
    name: 'Kontrol Programı',
    status: 'aktif',
    isTemplate: false,
    endDate: new Date('2026-09-07'),
    updatedAt: new Date('2026-08-28'),
    targetKcal: 1650,
  },
]
const feed: PanelFeed = {
  todayAppointmentsCount: 3,
  noShowCount: 1,
  staleMeasurementCount: 2,
  expiringPackageCount: 0,
  staleMeasurementClients: [],
  expiringPackages: [],
  canManageFinance: true,
  upcomingAppointments: [],
}

function Screen({
  route,
  role,
  repositories,
  navigate,
}: {
  route: string
  role: ClinicRole
  repositories: OgunRepositories
  navigate: (href: string) => void
}) {
  if (route === '/danisanlar')
    return <LocalClientsAdapter role={role} repositories={repositories} />
  if (route === '/danisanlar/yeni')
    return (
      <LocalNewClientAdapter
        repository={repositories.clients}
        onCreated={(id) => navigate(`/danisanlar/${id}`)}
      />
    )
  if (route.startsWith('/danisanlar/'))
    return (
      <LocalClientDetailAdapter
        key={route}
        clientId={route.split('/')[2]!}
        role={role}
        repositories={repositories}
      />
    )
  if (route === '/planlar')
    return (
      <PlansScreen
        plans={planRows}
        templates={[]}
        clientNames={{ 'client-1': 'Deniz Yılmaz', 'client-2': 'Selin Kaya' }}
        now={new Date('2026-08-30T10:00:00+03:00')}
      />
    )
  return <PanelScreen feed={feed} now={new Date('2026-08-30T10:00:00+03:00')} />
}

export function DesktopLayoutSmokeApp({ initialRoute }: { initialRoute: string }) {
  const [route, setRoute] = useState(`/${initialRoute.replace(/^\//, '')}`)
  const params = new URLSearchParams(window.location.search)
  const role: ClinicRole =
    params.get('role') === 'assistant'
      ? 'assistant'
      : params.get('role') === 'dietitian'
        ? 'dietitian'
        : 'owner'
  const [repositories] = useState(() =>
    createLayoutFixtureRepositories(params.has('fixture-error')),
  )
  const title = route.startsWith('/danisanlar')
    ? 'Danışanlar'
    : route === '/planlar'
      ? 'Planlar'
      : 'Panel'
  return (
    <NavigationProvider navigate={setRoute}>
      <AppShellFrame
        clinicName="Deştiş Kliniği"
        clinicInitials="DK"
        userName="Dyt. Ada Demir"
        desktopTitlebar={
          <DesktopTitlebarView
            maximized={false}
            search={
              <button
                type="button"
                aria-label="Ara veya komut çalıştır"
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2"
              >
                <Search className="size-4 shrink-0" aria-hidden="true" />
                <span>Ara veya komut çalıştır</span>
              </button>
            }
            onMinimize={() => undefined}
            onToggleMaximize={() => undefined}
            onClose={() => undefined}
          />
        }
        navigation={
          <SidebarNavView
            role={role}
            currentPath={route}
            connectivity="offline"
            onNavigate={setRoute}
          />
        }
        topbar={
          <TopBarView
            pageContext={<span className="font-semibold">{title}</span>}
            clinicSwitcher={<span className="text-sm font-medium">Deştiş Kliniği</span>}
            search={
              <button
                type="button"
                aria-label="Ara veya komut çalıştır"
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2"
              >
                <Search className="size-4 shrink-0" aria-hidden="true" />
                <span>Ara veya komut çalıştır</span>
              </button>
            }
            userMenu={<button type="button">Ada Demir</button>}
          />
        }
        bottomNavigation={<BottomNavView role={role} currentPath={route} onNavigate={setRoute} />}
      >
        <Screen route={route} role={role} repositories={repositories} navigate={setRoute} />
      </AppShellFrame>
    </NavigationProvider>
  )
}

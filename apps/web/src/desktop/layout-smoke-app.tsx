import { useState } from 'react'
import { AppShellFrame } from '@/components/app-shell-frame'
import { BottomNavView, DesktopTitlebarView, SidebarNavView, TopBarView } from '@/components/app-shell-views'
import { NavigationProvider } from '@/components/navigation-link'
import { ClientsScreen } from '@/screens/clients-screen'
import { ClientsTableView } from '@/screens/clients-table-view'
import { PanelScreen, type PanelFeed } from '@/screens/panel-screen'
import { PlansScreen, type PlanScreenRow } from '@/screens/plans-screen'

const clientRows = [
  { id: 'client-1', firstName: 'Deniz', lastName: 'Yılmaz', birthDate: '1992-04-12', status: 'aktif' as const, assignedDietitianId: 'user-1', assignedDietitianName: 'Dyt. Ada Demir', createdAt: new Date('2026-08-01') },
  { id: 'client-2', firstName: 'Selin', lastName: 'Kaya', birthDate: '1986-09-21', status: 'aktif' as const, assignedDietitianId: 'user-1', assignedDietitianName: 'Dyt. Ada Demir', createdAt: new Date('2026-08-04') },
]
const planRows: PlanScreenRow[] = [
  { id: 'plan-1', clientId: 'client-1', name: 'Dengeli Beslenme Programı', status: 'taslak', isTemplate: false, endDate: null, updatedAt: new Date('2026-08-29'), targetKcal: 1800 },
  { id: 'plan-2', clientId: 'client-2', name: 'Kontrol Programı', status: 'aktif', isTemplate: false, endDate: new Date('2026-09-07'), updatedAt: new Date('2026-08-28'), targetKcal: 1650 },
]
const feed: PanelFeed = { todayAppointmentsCount: 3, noShowCount: 1, staleMeasurementCount: 2, expiringPackageCount: 0, staleMeasurementClients: [], expiringPackages: [], canManageFinance: true, upcomingAppointments: [] }

function Screen({ route }: { route: string }) {
  if (route === '/danisanlar') return <ClientsScreen role="owner"><ClientsTableView result={{ rows: clientRows, total: clientRows.length, page: 1, pageSize: 20 }} dietitians={[]} role="owner" filters={{ search: '', status: '', assignedDietitianId: '' }} onNavigate={() => undefined} onArchive={async () => ({ success: true })} onAssign={async () => ({ success: true })} /></ClientsScreen>
  if (route === '/planlar') return <PlansScreen plans={planRows} templates={[]} clientNames={{ 'client-1': 'Deniz Yılmaz', 'client-2': 'Selin Kaya' }} now={new Date('2026-08-30T10:00:00+03:00')} />
  return <PanelScreen feed={feed} now={new Date('2026-08-30T10:00:00+03:00')} />
}

export function DesktopLayoutSmokeApp({ initialRoute }: { initialRoute: string }) {
  const [route, setRoute] = useState(initialRoute)
  const title = route === '/danisanlar' ? 'Danışanlar' : route === '/planlar' ? 'Planlar' : 'Panel'
  return <NavigationProvider navigate={setRoute}><AppShellFrame clinicName="Deştiş Kliniği" clinicInitials="DK" userName="Dyt. Ada Demir" desktopTitlebar={<DesktopTitlebarView maximized={false} search={<button type="button">Ara veya komut çalıştır</button>} onMinimize={() => undefined} onToggleMaximize={() => undefined} onClose={() => undefined} />} navigation={<SidebarNavView role="owner" currentPath={route} connectivity="offline" onNavigate={setRoute} />} topbar={<TopBarView pageContext={<span className="font-semibold">{title}</span>} clinicSwitcher={<span className="text-sm font-medium">Deştiş Kliniği</span>} search={<button type="button">Ara veya komut çalıştır</button>} userMenu={<button type="button">Ada Demir</button>} />} bottomNavigation={<BottomNavView role="owner" currentPath={route} onNavigate={setRoute} />}><Screen route={route} /></AppShellFrame></NavigationProvider>
}

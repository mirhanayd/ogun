import { useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { KeyRound, Leaf, LockKeyhole, LogOut, Mail, Search } from 'lucide-react'
import { AppShellFrame } from '@/components/app-shell-frame'
import { BottomNavView, DesktopTitlebarView, SidebarNavView, TopBarView } from '@/components/app-shell-views'
import { NavigationProvider } from '@/components/navigation-link'
import { AuthCard, AuthError } from '@/app/(auth)/_components/auth-card'
import { DesktopSavedAccounts } from '@/components/desktop-saved-accounts'
import { ConnectivityStatusProvider, useConnectivityStatus } from '@/components/connectivity-status-provider'
import { OfflineIndicator } from '@/components/offline-indicator'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authClient } from '@/lib/auth-client'
import { cloudUrl } from '@/lib/cloud-origin'
import type { DesktopOfflineProfile } from '@/lib/desktop-offline'
import { clearNativeSessionToken, getCachedNativeSessionToken, loadNativeSessionToken } from '@/lib/native-shell'
import { getClinicBrandingVariables } from '@/lib/clinic-branding'
import { useDesktopWindowControls } from '@/components/use-desktop-window-controls'
import { visibleNavItems } from '@/app/(app)/_components/nav-items'
import { LocalClientsAdapter, LocalClientDetailAdapter } from './local-clients-adapter'
import { AppointmentsWorkspaceScreen } from '@/screens/workspace-operations-screen'
import { FoodCatalogScreen } from '@/screens/food-catalog-screen'
import { PanelScreen, type PanelFeed } from '@/screens/panel-screen'
import { PlansScreen, type PlanScreenRow } from '@/screens/plans-screen'
import type { DomainEntity, OgunRepositories } from '@/data/repositories'
import { LocalPlanEditor } from './local-plan-editor'
import { createNativeRepositories, listLocalEntities, replaceLocalWorkspace, type DesktopWorkspacePayload } from './native-workspace-repository'
import { DesktopSyncIndicator, DesktopSyncProvider } from './sync-engine'

type Route = string

interface DesktopIdentity {
  userId: string
  email: string
  displayName: string
  clinicId: string
  clinicName: string
  clinicLogoUrl?: string | null
  clinicPrimaryColor?: string | null
  role: 'owner' | 'dietitian' | 'assistant'
}

function scopeOf(identity: DesktopIdentity) {
  return {
    userId: identity.userId,
    clinicId: identity.clinicId,
    role: identity.role,
    capabilities: identity.role === 'owner' ? ['*'] : ['clients:assigned', 'clinical:write', 'plans:write', 'appointments:write'],
  }
}

function authHeaders(): HeadersInit {
  const token = getCachedNativeSessionToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function NativeDesktopTitlebar() {
  const { maximized, titlebarHandlers, withWindow } = useDesktopWindowControls()
  return <DesktopTitlebarView maximized={maximized} titlebarProps={titlebarHandlers} search={<button type="button" disabled className="flex w-full items-center gap-2 rounded-lg border px-3 text-xs opacity-70"><Search className="size-3.5" />Ara veya komut çalıştır</button>} onMinimize={() => void withWindow('minimize')} onToggleMaximize={() => void withWindow('toggleMaximize')} onClose={() => void withWindow('close')} />
}

function useLocalScreenRows(repositories: OgunRepositories) {
  const [rows, setRows] = useState({ clients: [] as DomainEntity[], plans: [] as DomainEntity[], appointments: [] as DomainEntity[], measurements: [] as DomainEntity[] })
  useEffect(() => {
    const load = async () => {
      const [clients, plans, appointments] = await Promise.all([repositories.clients.list(), repositories.plans.list(), repositories.appointments.list()])
      const measurements = (await Promise.all(clients.map((client) => repositories.clinical.listForClient('measurements', client.id)))).flat()
      setRows({ clients, plans, appointments, measurements })
    }
    void load()
    window.addEventListener('ogun-local-data-changed', load)
    return () => window.removeEventListener('ogun-local-data-changed', load)
  }, [repositories])
  return rows
}

function localPanelFeed(rows: ReturnType<typeof useLocalScreenRows>, role: DesktopIdentity['role'], now = new Date()): PanelFeed {
  const client = (id: unknown) => rows.clients.find((item) => item.id === id)
  const sameDay = (value: Date) => value.toDateString() === now.toDateString()
  const upcoming = rows.appointments.map((item) => ({ item, startsAt: new Date(String(item.startsAt ?? '')) })).filter(({ startsAt, item }) => startsAt >= now && startsAt.getTime() <= now.getTime() + 7 * 86_400_000 && item.status !== 'iptal').slice(0, 6)
  return {
    todayAppointmentsCount: rows.appointments.filter((item) => sameDay(new Date(String(item.startsAt ?? '')))).length,
    noShowCount: rows.appointments.filter((item) => item.status === 'gelmedi').length,
    staleMeasurementCount: 0,
    expiringPackageCount: 0,
    staleMeasurementClients: [],
    expiringPackages: [],
    canManageFinance: role === 'owner',
    upcomingAppointments: upcoming.map(({ item, startsAt }) => {
      const owner = client(item.clientId)
      return {
        id: item.id,
        clientId: String(item.clientId ?? ''),
        clientFirstName: String(owner?.firstName ?? 'Danışan'),
        clientLastName: String(owner?.lastName ?? ''),
        startsAt,
        endsAt: new Date(String(item.endsAt ?? startsAt)),
        status: item.status === 'ertelendi' ? 'ertelendi' : 'planlandı',
        type: item.type === 'ilk_görüşme' || item.type === 'online' || item.type === 'ölçüm' ? item.type : 'kontrol',
        dietitianId: String(item.dietitianId ?? ''),
        dietitianName: String(item.dietitianName ?? 'Diyetisyen'),
        location: typeof item.location === 'string' ? item.location : null,
        packageSessionId: null,
        notes: null,
        createdAt: startsAt,
        updatedAt: startsAt,
      }
    }),
  }
}

function localPlanRows(rows: DomainEntity[]): PlanScreenRow[] {
  return rows.map((plan) => ({
    id: plan.id,
    clientId: typeof plan.clientId === 'string' ? plan.clientId : null,
    name: String(plan.name ?? 'İsimsiz plan'),
    status: plan.status === 'aktif' || plan.status === 'arşiv' ? plan.status : 'taslak',
    isTemplate: plan.isTemplate === true,
    endDate: plan.endDate ? new Date(String(plan.endDate)) : null,
    updatedAt: new Date(String(plan.updatedAt ?? new Date().toISOString())),
    targetKcal: typeof plan.targetKcal === 'number' ? plan.targetKcal : null,
  }))
}

function DesktopWorkspace({ identity, onLogout }: { identity: DesktopIdentity; onLogout: () => void }) {
  const [route, setRoute] = useState<Route>('/panel')
  const repositories = useMemo(() => createNativeRepositories(scopeOf(identity)), [identity])
  const localRows = useLocalScreenRows(repositories)
  const [branding, setBranding] = useState({ logoUrl: identity.clinicLogoUrl ?? null, primaryColor: identity.clinicPrimaryColor ?? null })
  const connectivity = useConnectivityStatus()
  useEffect(() => {
    void listLocalEntities(scopeOf(identity), 'clinic').then(([clinic]) => {
      if (!clinic) return
      setBranding({
        logoUrl: typeof clinic.logoUrl === 'string' ? clinic.logoUrl : null,
        primaryColor: typeof clinic.primaryColor === 'string' ? clinic.primaryColor : null,
      })
    })
  }, [identity])
  const routeRoot = `/${route.split('/').filter(Boolean)[0] ?? 'panel'}`
  const title = useMemo(() => visibleNavItems(identity.role).find((item) => item.href === routeRoot)?.label ?? 'Panel', [identity.role, routeRoot])
  const initials = identity.clinicName.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toLocaleUpperCase('tr-TR')
  const planRoute = route.match(/^\/danisanlar\/([^/]+)\/planlar\/([^/]+)$/)
  const clientRoute = route.match(/^\/danisanlar\/([^/]+)$/)
  const clientId = clientRoute?.[1] ?? null
  async function logout() {
    await authClient.signOut().catch(() => undefined)
    await clearNativeSessionToken()
    onLogout()
  }
  const routedPlan = planRoute ? localRows.plans.find((plan) => plan.id === planRoute[2]) : null
  const routedClient = planRoute ? localRows.clients.find((client) => client.id === planRoute[1]) : null
  const content = routedPlan && routedClient ? <LocalPlanEditor plan={routedPlan} client={routedClient} repository={repositories.plans} /> : clientId ? <LocalClientDetailAdapter clientId={clientId} role={identity.role} repositories={repositories} onBack={() => setRoute('/danisanlar')} /> : route === '/danisanlar' ? <LocalClientsAdapter role={identity.role} repository={repositories.clients} onOpen={(id) => setRoute(`/danisanlar/${id}`)} /> : route === '/panel' ? <PanelScreen feed={localPanelFeed(localRows, identity.role)} /> : route === '/planlar' ? <PlansScreen plans={localPlanRows(localRows.plans)} templates={localPlanRows(localRows.plans).filter((plan) => plan.isTemplate)} clientNames={Object.fromEntries(localRows.clients.map((client) => [client.id, `${String(client.firstName ?? '')} ${String(client.lastName ?? '')}`.trim()]))} /> : route === '/randevular' ? <AppointmentsWorkspaceScreen repository={repositories} /> : route === '/tarifler' ? <FoodCatalogScreen /> : <div className="grid min-h-80 place-items-center rounded-2xl border border-border/70 bg-card text-center shadow-sm"><div><Leaf className="mx-auto mb-3 size-8 text-primary" /><p className="font-semibold">{title} yerel veritabanından hazırlanıyor…</p></div></div>
  return (
    <NavigationProvider navigate={setRoute}><AppShellFrame clinicName={identity.clinicName} clinicLogoUrl={branding.logoUrl} clinicInitials={initials} userName={identity.displayName} brandingStyle={getClinicBrandingVariables(branding.primaryColor)} desktopTitlebar={<NativeDesktopTitlebar />} navigation={<SidebarNavView role={identity.role} currentPath={route} connectivity={connectivity} onNavigate={setRoute} />} topbar={<TopBarView pageContext={<span className="font-semibold">{title}</span>} clinicSwitcher={<span className="text-sm font-medium">{identity.clinicName}</span>} search={<button type="button" disabled className="rounded-lg border px-3 py-2 text-sm text-muted-foreground">Ara veya komut çalıştır</button>} userMenu={<Button type="button" variant="ghost" size="sm" onClick={() => void logout()}><LogOut />Çıkış yap</Button>} />} bottomNavigation={<BottomNavView role={identity.role} currentPath={route} onNavigate={setRoute} />} overlays={<><OfflineIndicator /><DesktopSyncIndicator /></>}>
      {content}
    </AppShellFrame></NavigationProvider>
  )
}

function PinSetup({ identity, onComplete }: { identity: DesktopIdentity; onComplete: () => void }) {
  const [pin, setPin] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function save() {
    if (pin.length < 4 || pin !== confirmation) { setError('PIN en az 4 rakam olmalı ve iki giriş eşleşmelidir.'); return }
    setBusy(true); setError(null)
    try { await invoke('configure_offline_pin', { userId: identity.userId, newPin: pin, currentPin: null }); onComplete() } catch (reason) { setError(String(reason)) } finally { setBusy(false) }
  }
  return <AuthSurface><AuthCard eyebrow="Cihaz güvenliği" title="Yerel çalışma alanınızı kilitleyin." description="Bu PIN Better Auth hesabınızın yerine geçmez; yalnızca daha önce doğrulanmış bu cihazdaki şifreli klinik verisini açar."><div className="space-y-4"><div className="grid gap-2"><Label htmlFor="desktop-pin">4–8 rakamlı PIN</Label><Input id="desktop-pin" type="password" inputMode="numeric" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 8))} /></div><div className="grid gap-2"><Label htmlFor="desktop-pin-confirm">PIN tekrarı</Label><Input id="desktop-pin-confirm" type="password" inputMode="numeric" value={confirmation} onChange={(event) => setConfirmation(event.target.value.replace(/\D/g, '').slice(0, 8))} /></div>{error ? <AuthError>{error}</AuthError> : null}<Button className="w-full" disabled={busy} onClick={() => void save()}><KeyRound />{busy ? 'Kaydediliyor…' : 'PIN’i kaydet ve devam et'}</Button></div></AuthCard></AuthSurface>
}

function AuthSurface({ children }: { children: React.ReactNode }) {
  return <div className="min-h-svh bg-background text-foreground"><NativeDesktopTitlebar /><main className="mx-auto grid min-h-[calc(100svh-3rem)] max-w-6xl items-center px-6 py-12"><div className="mx-auto w-full max-w-lg rounded-3xl border border-border/70 bg-card p-8 shadow-xl">{children}</div></main></div>
}

function DesktopLogin({ onAuthenticated }: { onAuthenticated: (identity: DesktopIdentity, needsPin: boolean) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function finishOnlineAuthentication() {
    const { data: session, error: sessionError } = await authClient.getSession()
    if (!session || sessionError || !session.session.activeClinicId || !session.session.role) throw new Error('Aktif klinik oturumu bulunamadı.')
    const response = await fetch(cloudUrl('/api/desktop/workspace'), { cache: 'no-store', credentials: 'include', headers: authHeaders() })
    if (!response.ok) throw new Error('Klinik çalışma alanı indirilemedi.')
    const workspace = await response.json() as DesktopWorkspacePayload
    if (!['owner', 'dietitian', 'assistant'].includes(session.session.role)) throw new Error('Klinik rolü yerel çalışma için desteklenmiyor.')
    const identity: DesktopIdentity = { userId: session.user.id, email: session.user.email, displayName: session.user.name, clinicId: workspace.clinic.id, clinicName: workspace.clinic.name, clinicLogoUrl: typeof workspace.clinic.logoUrl === 'string' ? workspace.clinic.logoUrl : null, clinicPrimaryColor: typeof workspace.clinic.primaryColor === 'string' ? workspace.clinic.primaryColor : null, role: session.session.role as DesktopIdentity['role'] }
    const profiles = await invoke<DesktopOfflineProfile[]>('list_offline_profiles')
    const previous = profiles.find((profile) => profile.userId === identity.userId && profile.clinicId === identity.clinicId)
    await invoke('upsert_offline_profile', { profile: { ...identity, lastSyncedAt: new Date().toISOString() } })
    await invoke('initialize_local_scope', { scope: scopeOf(identity) })
    await replaceLocalWorkspace(scopeOf(identity), workspace)
    onAuthenticated(identity, !previous?.pinConfigured)
  }

  useEffect(() => {
    if (!getCachedNativeSessionToken() || !navigator.onLine) return
    setBusy(true)
    void finishOnlineAuthentication()
      .catch(() => undefined)
      .finally(() => setBusy(false))
    // Run once for the bearer token loaded by DesktopApp.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function signIn(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(null)
    try { const result = await authClient.signIn.email({ email, password }); if (result.error) throw new Error(result.error.message ?? 'Giriş yapılamadı.'); await finishOnlineAuthentication() } catch (reason) { setError(String(reason)) } finally { setBusy(false) }
  }

  return <AuthSurface><AuthCard eyebrow="Tekrar hoş geldiniz" title="Kliniğinize kaldığınız yerden devam edin." description="İlk cihaz kurulumu normal Öğün hesabıyla çevrimiçi yapılır. Daha sonraki çevrimdışı açılışlarda PIN yalnızca yerel kasayı açar."><DesktopSavedAccounts onUnlocked={(profile) => onAuthenticated({ userId: profile.userId, email: profile.email, displayName: profile.displayName, clinicId: profile.clinicId, clinicName: profile.clinicName, role: profile.role as DesktopIdentity['role'] }, false)} /><form className="flex flex-col gap-5" onSubmit={signIn}><div className="grid gap-2"><Label htmlFor="desktop-email">E-posta</Label><div className="relative"><Mail className="absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="desktop-email" type="email" autoComplete="email" className="pl-10" value={email} onChange={(event) => setEmail(event.target.value)} /></div></div><div className="grid gap-2"><Label htmlFor="desktop-password">Şifre</Label><div className="relative"><LockKeyhole className="absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="desktop-password" type="password" autoComplete="current-password" className="pl-10" value={password} onChange={(event) => setPassword(event.target.value)} /></div></div>{error ? <AuthError>{error}</AuthError> : null}<Button type="submit" disabled={busy}>{busy ? 'Giriş yapılıyor…' : 'Giriş yap'}</Button></form></AuthCard></AuthSurface>
}

export function DesktopApp() {
  const [identity, setIdentity] = useState<DesktopIdentity | null>(null)
  const [needsPin, setNeedsPin] = useState(false)
  const [checking, setChecking] = useState(true)
  useEffect(() => { void loadNativeSessionToken().finally(() => setChecking(false)) }, [])
  if (checking) return <AuthSurface><div className="flex items-center justify-center gap-3"><Leaf className="size-6 text-primary" />Öğün açılıyor…</div></AuthSurface>
  if (!identity) return <DesktopLogin onAuthenticated={(next, pinRequired) => { setIdentity(next); setNeedsPin(pinRequired) }} />
  if (needsPin) return <PinSetup identity={identity} onComplete={() => setNeedsPin(false)} />
  return <ConnectivityStatusProvider><DesktopSyncProvider scope={scopeOf(identity)}><DesktopWorkspace identity={identity} onLogout={() => { setIdentity(null); setNeedsPin(false) }} /></DesktopSyncProvider></ConnectivityStatusProvider>
}

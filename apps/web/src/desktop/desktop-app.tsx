import { useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { KeyRound, Leaf, LockKeyhole, Mail, Maximize2, Minus, X } from 'lucide-react'
import { AppShellFrame } from '@/components/app-shell-frame'
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
import { getCachedNativeSessionToken, loadNativeSessionToken } from '@/lib/native-shell'
import { cn } from '@/lib/utils'
import { visibleNavItems } from '@/app/(app)/_components/nav-items'
import { replaceLocalWorkspace, type DesktopWorkspacePayload } from './native-workspace-repository'
import { DesktopSyncIndicator, DesktopSyncProvider } from './sync-engine'

type Route = '/panel' | '/danisanlar' | '/randevular' | '/planlar' | '/tarifler' | '/finans' | '/ayarlar'

interface DesktopIdentity {
  userId: string
  email: string
  displayName: string
  clinicId: string
  clinicName: string
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

function DesktopTitlebar({ clinicName }: { clinicName: string }) {
  const control = (action: 'minimize' | 'toggleMaximize' | 'close') =>
    void invoke('control_main_window', { action })
  return (
    <header className="clinic-desktop-titlebar desktop-titlebar relative z-50 flex h-12 shrink-0 select-none items-center border-b">
      <div className="flex w-60 items-center gap-2.5 px-4"><span className="grid size-7 place-items-center rounded-lg bg-white/15"><Leaf className="size-4" /></span><span className="text-sm font-semibold">öğün</span><span className="rounded-full border border-current/15 bg-current/10 px-2 py-0.5 text-[9px] font-semibold tracking-[0.14em] uppercase">Desktop</span></div>
      <div className="flex-1 truncate text-center text-xs font-medium opacity-75">{clinicName}</div>
      <div className="flex h-full border-l border-current/10"><button type="button" aria-label="Küçült" onClick={() => control('minimize')} className="grid h-full w-11 place-items-center hover:bg-current/10"><Minus className="size-3.5" /></button><button type="button" aria-label="Büyüt" onClick={() => control('toggleMaximize')} className="grid h-full w-11 place-items-center hover:bg-current/10"><Maximize2 className="size-3.5" /></button><button type="button" aria-label="Kapat" onClick={() => control('close')} className="grid h-full w-11 place-items-center hover:bg-red-500 hover:text-white"><X className="size-3.5" /></button></div>
    </header>
  )
}

function DesktopNavigation({ identity, route, onNavigate }: { identity: DesktopIdentity; route: Route; onNavigate: (route: Route) => void }) {
  const connectivity = useConnectivityStatus()
  return (
    <nav className="flex min-h-0 flex-1 flex-col px-3 pb-4" aria-label="Ana gezinme">
      <p className="mb-2 px-3 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground/80 uppercase">Klinik yönetimi</p>
      <div className="flex flex-col gap-1">{visibleNavItems(identity.role).map((item) => { const active = route === item.href; return <button key={item.href} type="button" onClick={() => onNavigate(item.href as Route)} className={cn('group relative flex h-10 items-center gap-3 rounded-xl px-3 text-[0.82rem] font-medium text-sidebar-foreground/65 transition-all hover:bg-sidebar-accent/60 hover:text-sidebar-foreground', active && 'bg-sidebar-accent text-sidebar-accent-foreground')}><span className={cn('grid size-7 place-items-center rounded-lg text-muted-foreground', active && 'bg-sidebar-primary/10 text-sidebar-primary')}><item.icon className="size-4" /></span>{item.label}</button> })}</div>
      <div className="mt-auto rounded-xl border border-sidebar-border bg-background/45 p-3 text-xs"><span className={cn('mr-2 inline-block size-1.5 rounded-full', connectivity === 'online' ? 'bg-emerald-500' : connectivity === 'offline' ? 'bg-destructive' : 'bg-amber-500')} />{connectivity === 'online' ? 'Güncel' : connectivity === 'offline' ? 'Çevrimdışı' : 'Bağlantı kontrol ediliyor'}</div>
    </nav>
  )
}

function DesktopWorkspace({ identity }: { identity: DesktopIdentity }) {
  const [route, setRoute] = useState<Route>('/panel')
  const title = useMemo(() => visibleNavItems(identity.role).find((item) => item.href === route)?.label ?? 'Panel', [identity.role, route])
  const initials = identity.clinicName.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toLocaleUpperCase('tr-TR')
  return (
    <AppShellFrame clinicName={identity.clinicName} clinicInitials={initials} userName={identity.displayName} desktopTitlebar={<DesktopTitlebar clinicName={identity.clinicName} />} navigation={<DesktopNavigation identity={identity} route={route} onNavigate={setRoute} />} topbar={<header className="app-topbar flex h-[4.5rem] shrink-0 items-center border-b border-border/80 bg-background/90 px-6"><span className="font-semibold">{title}</span></header>} bottomNavigation={null} overlays={<><OfflineIndicator /><DesktopSyncIndicator /></>}>
      <div className="grid min-h-80 place-items-center rounded-2xl border border-border/70 bg-card text-center shadow-sm"><div><Leaf className="mx-auto mb-3 size-8 text-primary" /><p className="font-semibold">{title} yerel veritabanından hazırlanıyor…</p></div></div>
    </AppShellFrame>
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
  return <div className="min-h-svh bg-background text-foreground"><DesktopTitlebar clinicName="Öğün" /><main className="mx-auto grid min-h-[calc(100svh-3rem)] max-w-6xl items-center px-6 py-12"><div className="mx-auto w-full max-w-lg rounded-3xl border border-border/70 bg-card p-8 shadow-xl">{children}</div></main></div>
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
    const identity: DesktopIdentity = { userId: session.user.id, email: session.user.email, displayName: session.user.name, clinicId: workspace.clinic.id, clinicName: workspace.clinic.name, role: session.session.role as DesktopIdentity['role'] }
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
  return <ConnectivityStatusProvider><DesktopSyncProvider scope={scopeOf(identity)}><DesktopWorkspace identity={identity} /></DesktopSyncProvider></ConnectivityStatusProvider>
}

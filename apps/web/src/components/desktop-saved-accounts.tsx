'use client'

import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { ChevronRight, KeyRound, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { authClient } from '@/lib/auth-client'
import { desktopPinDestination, type DesktopOfflineProfile } from '@/lib/desktop-offline'
import { isNativeShell } from '@/lib/native-shell'

export function DesktopSavedAccounts() {
  const [profiles, setProfiles] = useState<DesktopOfflineProfile[]>([])
  const [selected, setSelected] = useState<DesktopOfflineProfile | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!isNativeShell()) return
    void invoke<DesktopOfflineProfile[]>('list_offline_profiles')
      .then((items) => setProfiles(items.filter((item) => item.pinConfigured)))
      .catch(() => setProfiles([]))
  }, [])

  if (profiles.length === 0) return null

  async function unlock() {
    if (!selected) return
    setBusy(true)
    setError(null)
    try {
      await invoke('unlock_offline_profile', { userId: selected.userId, pin })
      const online = await invoke<boolean>('desktop_network_available')
      if (desktopPinDestination(online) === 'online-app') {
        // PIN bir çalışma modu seçmez; yalnızca cihazdaki hesabın kilidini açar.
        // Ağ varsa saklanan Better Auth oturumunu doğrulayıp her zamanki ortak
        // uygulama kabuğuna geç. Yerel çalışma alanına yalnızca gerçekten ağ
        // yoksa düşülür.
        const { data: session, error: sessionError } = await authClient.getSession()
        if (!session || sessionError) {
          throw new Error(
            'Sunucu oturumunuzun süresi dolmuş. Lütfen hesabınızla yeniden giriş yapın.',
          )
        }
        window.location.assign('/panel')
        return
      }
      await invoke('show_offline_workspace')
    } catch (unlockError) {
      setError(String(unlockError))
      setPin('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mb-5 rounded-2xl border border-primary/15 bg-primary/[0.045] p-3">
      <div className="flex items-center gap-2 px-1 pb-2 text-xs font-bold tracking-[0.1em] text-primary uppercase">
        <KeyRound className="size-3.5" />
        Bu cihazdaki hesaplar
      </div>
      {!selected ? (
        <div className="grid gap-2">
          {profiles.map((profile) => (
            <button
              type="button"
              key={`${profile.userId}:${profile.clinicId}`}
              className="group flex items-center gap-3 rounded-xl border border-border/70 bg-card px-3 py-3 text-left shadow-sm transition hover:border-primary/30 hover:shadow-md"
              onClick={() => {
                setSelected(profile)
                setError(null)
              }}
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <UserRound className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{profile.displayName}</span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {profile.clinicName} · {profile.email}
                </span>
              </span>
              <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-border/70 bg-card p-3">
          <p className="text-sm font-semibold">{selected.displayName}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{selected.clinicName}</p>
          <Input
            autoFocus
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 8))}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void unlock()
            }}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Hızlı giriş PIN’i"
            className="mt-3 h-10 rounded-xl text-center tracking-[0.3em]"
          />
          {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => {
                setSelected(null)
                setPin('')
              }}
            >
              Geri
            </Button>
            <Button type="button" className="rounded-xl" disabled={busy} onClick={unlock}>
              {busy ? 'Açılıyor…' : 'PIN ile hızlı giriş'}
            </Button>
          </div>
        </div>
      )}
      <p className="px-1 pt-2 text-[11px] leading-4 text-muted-foreground">
        Hızlı giriş PIN’i bir çalışma modu değildir; bu cihazdaki kayıtlı hesabın kilidini açar.
      </p>
    </section>
  )
}

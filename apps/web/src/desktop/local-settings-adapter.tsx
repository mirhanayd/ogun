import { useEffect, useState } from 'react'
import type { DomainEntity, OgunRepositories } from '@/data/repositories'
import { SettingsScreen, type SettingsUserView, type WorkingHourView } from '@/screens/settings-screen'
import type { ClinicIdentityFormValues } from '@/lib/validation/clinic-identity-schemas'
import type { ClinicTeamMember, PendingClinicInvitation } from '@ogun/db/queries'
import { SettingsSubpage, TeamSettingsView, ReminderSettingsView, SharingSettingsView, SecuritySettingsView, SubscriptionSettingsView, type SettingsAuditLog } from '@/screens/settings-subpages'
import { useConnectivityStatus } from '@/components/connectivity-status-provider'
import { Button } from '@/components/ui/button'
import { cloudUrl } from '@/lib/cloud-origin'
import { getCachedNativeSessionToken } from '@/lib/native-shell'
import { useDesktopSync } from './sync-engine'

type SettingsRouteKind = 'settings' | 'settings_team' | 'settings_reminders' | 'settings_sharing' | 'settings_security' | 'settings_subscription'
interface SettingsSnapshot {
  team: { members: ClinicTeamMember[]; invitations: PendingClinicInvitation[] } | null
  recentLogs: SettingsAuditLog[]
  smsReminderTemplate: string | null
  whatsappMessageTemplate: string | null
  dataRetentionDays: number
}

export function LocalSettingsAdapter({ repository, user, routeKind = 'settings' }: { repository: OgunRepositories['records']; user: SettingsUserView; routeKind?: SettingsRouteKind }) {
  const [clinic, setClinic] = useState<DomainEntity | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [hours, setHours] = useState<WorkingHourView[]>([])
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [actionPending, setActionPending] = useState(false)
  const connectivity = useConnectivityStatus()
  const { syncNow } = useDesktopSync()
  const disabled = connectivity !== 'online' || actionPending
  useEffect(() => {
    let active = true
    let generation = 0
    const load = async () => {
      const request = ++generation
      try {
        const [clinics, workingHours] = await Promise.all([repository.list('clinic'), repository.list('workingHours')])
        if (!active || request !== generation) return
        const identity = clinics.find((row) => row.id === user.clinicId)
        if (!identity) throw new Error('Yerel klinik kimliği bulunamadı.')
        setClinic(identity)
        setLoadError(null)
        setHours(workingHours.map((row) => ({ dayOfWeek: Number(row.dayOfWeek), isOpen: row.isOpen === true, startTime: String(row.startTime ?? '09:00'), endTime: String(row.endTime ?? '18:00') })))
      } catch (reason) {
        if (active && request === generation) setLoadError(String(reason))
      }
    }
    void load()
    window.addEventListener('ogun-local-data-changed', load)
    return () => { active = false; window.removeEventListener('ogun-local-data-changed', load) }
  }, [repository, user.clinicId])
  async function save(values: ClinicIdentityFormValues) { try { const next = { ...clinic, id: user.clinicId, ...values, logoUrl: values.logoUrl || null, primaryColor: values.primaryColor || null, phone: values.phone || null, address: values.address || null, taxId: values.taxId || null }; await repository.upsert('clinic', next, 'clinic.update'); return { success: true, identity: { name: String(next.name), logoUrl: next.logoUrl as string | null, primaryColor: next.primaryColor as string | null, phone: next.phone as string | null, address: next.address as string | null, taxId: next.taxId as string | null } } } catch (reason) { return { success: false, error: String(reason) } } }
  if (!clinic) return <p role={loadError ? 'alert' : 'status'}>{loadError ?? 'Klinik kimliği yükleniyor…'}</p>
  if (routeKind !== 'settings') {
    if (user.role !== 'owner') return <SettingsSubpage title="Ayarlar"><p>Bu sayfa için yönetici yetkisi gerekir.</p></SettingsSubpage>
    const settings = clinic.settings as SettingsSnapshot | undefined
    async function action(operation: string, values: unknown = null) {
      if (disabled) return { success: false, error: 'İnternet bağlantısı gerekli.' }
      setActionPending(true)
      try {
        const token = getCachedNativeSessionToken()
        const response = await fetch(cloudUrl('/api/desktop/settings'), {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ userId: user.userId, clinicId: user.clinicId, operation, values }),
        })
        const result = await response.json() as { success: boolean; error?: string }
        if (result.success) await syncNow()
        return result
      } catch { return { success: false, error: 'Sunucuya ulaşılamadı. İnternet bağlantısını kontrol edin.' } }
      finally { setActionPending(false) }
    }
    const titles = { settings_team: 'Ekip ve yetkiler', settings_reminders: 'Randevu hatırlatmaları', settings_sharing: 'Plan paylaşımı', settings_security: 'Veri güvenliği ve KVKK', settings_subscription: 'Abonelik' }
    const notice = connectivity !== 'online' ? 'İnternet bağlantısı gerekli. Kaydedilmiş ayarları görüntüleyebilirsiniz; sunucu işlemleri çevrimdışıyken kapalıdır.' : !settings ? 'Ayarların son hali eşitleniyor…' : null
    return <SettingsSubpage title={titles[routeKind]} notice={notice}>
      {routeKind === 'settings_team' ? <TeamSettingsView clinicName={String(clinic.name)} members={settings?.team?.members ?? []} invitations={settings?.team?.invitations ?? []} currentUserId={user.userId} disabled={disabled || !settings} actions={{ invite: (values) => action('invite', values), revoke: (id) => action('revoke', id), promote: (id) => action('promote', id), remove: (id) => action('remove', id) }} /> : null}
      {routeKind === 'settings_reminders' ? <ReminderSettingsView template={settings?.smsReminderTemplate} onSave={(values) => action('sms', values)} disabled={disabled || !settings} sweepControl={<><Button variant="outline" disabled={disabled || !settings} onClick={async () => { const result = await action('sweep'); setActionMessage(result.success ? 'Gönderim kontrolü tamamlandı.' : result.error ?? 'Gönderilemedi.') }}>SMS hatırlatmalarını şimdi gönder</Button>{actionMessage ? <p role="status">{actionMessage}</p> : null}</>} /> : null}
      {routeKind === 'settings_sharing' ? <SharingSettingsView template={settings?.whatsappMessageTemplate} onSave={(values) => action('sharing', values)} disabled={disabled || !settings} /> : null}
      {routeKind === 'settings_security' ? <SecuritySettingsView retentionDays={settings?.dataRetentionDays} recentLogs={settings?.recentLogs ?? []} onSave={(values) => action('retention', values)} disabled={disabled || !settings} /> : null}
      {routeKind === 'settings_subscription' ? <SubscriptionSettingsView /> : null}
    </SettingsSubpage>
  }
  return <SettingsScreen identity={{ name: String(clinic.name ?? user.clinicName), logoUrl: typeof clinic.logoUrl === 'string' ? clinic.logoUrl : null, primaryColor: typeof clinic.primaryColor === 'string' ? clinic.primaryColor : null, phone: typeof clinic.phone === 'string' ? clinic.phone : null, address: typeof clinic.address === 'string' ? clinic.address : null, taxId: typeof clinic.taxId === 'string' ? clinic.taxId : null }} workingHours={hours} user={user} onSaveIdentity={save} />
}

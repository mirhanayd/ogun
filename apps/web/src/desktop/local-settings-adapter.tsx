import { useEffect, useState } from 'react'
import type { DomainEntity, OgunRepositories } from '@/data/repositories'
import { SettingsScreen, type SettingsUserView, type WorkingHourView } from '@/screens/settings-screen'
import type { ClinicIdentityFormValues } from '@/lib/validation/clinic-identity-schemas'

export function LocalSettingsAdapter({ repository, user }: { repository: OgunRepositories['records']; user: SettingsUserView }) {
  const [clinic, setClinic] = useState<DomainEntity | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [hours, setHours] = useState<WorkingHourView[]>([])
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
  return <SettingsScreen identity={{ name: String(clinic.name ?? user.clinicName), logoUrl: typeof clinic.logoUrl === 'string' ? clinic.logoUrl : null, primaryColor: typeof clinic.primaryColor === 'string' ? clinic.primaryColor : null, phone: typeof clinic.phone === 'string' ? clinic.phone : null, address: typeof clinic.address === 'string' ? clinic.address : null, taxId: typeof clinic.taxId === 'string' ? clinic.taxId : null }} workingHours={hours} user={user} onSaveIdentity={save} />
}

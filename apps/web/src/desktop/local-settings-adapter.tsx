import { useEffect, useState } from 'react'
import type { DomainEntity, OgunRepositories } from '@/data/repositories'
import { SettingsScreen, type SettingsUserView, type WorkingHourView } from '@/screens/settings-screen'
import type { ClinicIdentityFormValues } from '@/lib/validation/clinic-identity-schemas'

export function LocalSettingsAdapter({ repository, user }: { repository: OgunRepositories['records']; user: SettingsUserView }) {
  const [clinic, setClinic] = useState<DomainEntity>({ id: user.clinicId, name: user.clinicName })
  const [hours, setHours] = useState<WorkingHourView[]>([])
  useEffect(() => { const load = async () => { const [clinics, workingHours] = await Promise.all([repository.list('clinic'), repository.list('workingHours')]); if (clinics[0]) setClinic(clinics[0]); setHours(workingHours.map((row) => ({ dayOfWeek: Number(row.dayOfWeek), isOpen: row.isOpen === true, startTime: String(row.startTime ?? '09:00'), endTime: String(row.endTime ?? '18:00') }))) }; void load(); window.addEventListener('ogun-local-data-changed', load); return () => window.removeEventListener('ogun-local-data-changed', load) }, [repository])
  async function save(values: ClinicIdentityFormValues) { try { const next = { ...clinic, id: user.clinicId, ...values, logoUrl: values.logoUrl || null, primaryColor: values.primaryColor || null, phone: values.phone || null, address: values.address || null, taxId: values.taxId || null }; await repository.upsert('clinic', next, 'clinic.update'); return { success: true, identity: { name: String(next.name), logoUrl: next.logoUrl as string | null, primaryColor: next.primaryColor as string | null, phone: next.phone as string | null, address: next.address as string | null, taxId: next.taxId as string | null } } } catch (reason) { return { success: false, error: String(reason) } } }
  return <SettingsScreen identity={{ name: String(clinic.name ?? user.clinicName), logoUrl: typeof clinic.logoUrl === 'string' ? clinic.logoUrl : null, primaryColor: typeof clinic.primaryColor === 'string' ? clinic.primaryColor : null, phone: typeof clinic.phone === 'string' ? clinic.phone : null, address: typeof clinic.address === 'string' ? clinic.address : null, taxId: typeof clinic.taxId === 'string' ? clinic.taxId : null }} workingHours={hours} user={user} onSaveIdentity={save} />
}

import { db } from '@ogun/db'
import { getClinicIdentityById, getWorkingHoursForClinic } from '@ogun/db/queries'
import { requireClinic } from '@/lib/authz'
import { SettingsScreen } from '@/screens/settings-screen'
import { updateClinicIdentityAction } from './clinic-identity-actions'

export default async function AyarlarPage() {
  const { scope, role, user } = await requireClinic()
  const [clinic, workingHours] = await Promise.all([getClinicIdentityById(db, scope.clinicId), getWorkingHoursForClinic(db, scope.clinicId)])
  if (!clinic) return <p className="text-sm text-muted-foreground">Klinik bulunamadı.</p>
  return <SettingsScreen identity={clinic} workingHours={workingHours} user={{ userId: user.id, email: user.email, displayName: user.name ?? user.email, clinicId: scope.clinicId, clinicName: clinic.name, role }} onSaveIdentity={updateClinicIdentityAction} />
}

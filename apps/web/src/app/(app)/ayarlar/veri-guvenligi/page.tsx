import { redirect } from 'next/navigation'
import { db } from '@ogun/db'
import { getClinicById, listRecentAuditLogsForClinic } from '@ogun/db/queries'
import { requireClinic } from '@/lib/authz'
import { SettingsSubpage, SecuritySettingsView } from '@/screens/settings-subpages'
import { updateDataRetentionAction } from './actions'

export default async function VeriGuvenligiPage() {
  const { scope, role } = await requireClinic()
  if (role !== 'owner') redirect('/ayarlar')
  const [clinic, recentLogs] = await Promise.all([getClinicById(db, scope.clinicId), listRecentAuditLogsForClinic(db, scope.clinicId, 50)])
  return <SettingsSubpage title="Veri güvenliği ve KVKK"><SecuritySettingsView retentionDays={clinic?.dataRetentionDays} recentLogs={recentLogs} onSave={updateDataRetentionAction} /></SettingsSubpage>
}

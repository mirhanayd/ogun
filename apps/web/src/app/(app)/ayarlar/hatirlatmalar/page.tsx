import { redirect } from 'next/navigation'
import { db } from '@ogun/db'
import { getClinicById } from '@ogun/db/queries'
import { requireClinic } from '@/lib/authz'
import { SettingsSubpage, ReminderSettingsView } from '@/screens/settings-subpages'
import { RunSmsSweepButton } from '../abonelik/subscription-controls'
import { updateSmsTemplateAction } from '../abonelik/actions'

export default async function ReminderSettingsPage() {
  const { scope, role } = await requireClinic()
  if (role !== 'owner') redirect('/ayarlar')
  const clinic = await getClinicById(db, scope.clinicId)
  if (!clinic) redirect('/ayarlar')
  return <SettingsSubpage title="Randevu hatırlatmaları"><ReminderSettingsView template={clinic.smsReminderTemplate} onSave={updateSmsTemplateAction} sweepControl={<RunSmsSweepButton />} /></SettingsSubpage>
}

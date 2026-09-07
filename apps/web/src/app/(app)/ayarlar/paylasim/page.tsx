import { redirect } from 'next/navigation'
import { db } from '@ogun/db'
import { getClinicById } from '@ogun/db/queries'
import { requireClinic } from '@/lib/authz'
import { SettingsSubpage, SharingSettingsView } from '@/screens/settings-subpages'
import { updateWhatsappTemplateAction } from './actions'

export default async function PaylasimAyarlariPage() {
  const { scope, role } = await requireClinic()
  if (role !== 'owner') redirect('/ayarlar')
  const clinic = await getClinicById(db, scope.clinicId)
  return <SettingsSubpage title="Plan paylaşımı"><SharingSettingsView template={clinic?.whatsappMessageTemplate} onSave={updateWhatsappTemplateAction} /></SettingsSubpage>
}

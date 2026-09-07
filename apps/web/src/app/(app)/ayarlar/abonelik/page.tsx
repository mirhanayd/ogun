import { redirect } from 'next/navigation'
import { requireClinic } from '@/lib/authz'
import { SettingsSubpage, SubscriptionSettingsView } from '@/screens/settings-subpages'
export default async function AbonelikAyarlariPage() {
  const { role } = await requireClinic()
  if (role !== 'owner') redirect('/ayarlar')
  return <SettingsSubpage title="Abonelik"><SubscriptionSettingsView /></SettingsSubpage>
}

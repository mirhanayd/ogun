import { redirect } from 'next/navigation'
import { db } from '@ogun/db'
import { getClinicById, listClinicTeam } from '@ogun/db/queries'
import { requireClinic } from '@/lib/authz'
import { SettingsSubpage, TeamSettingsView } from '@/screens/settings-subpages'
import { inviteDietitianAction, revokeClinicInvitationAction, promoteClinicMemberAction, removeClinicMemberAction } from './actions'

export default async function TeamSettingsPage() {
  const { scope, role, user } = await requireClinic()
  if (role !== 'owner') redirect('/ayarlar')
  const [clinic, team] = await Promise.all([getClinicById(db, scope.clinicId), listClinicTeam(db, scope.clinicId)])
  if (!clinic) redirect('/ayarlar')
  return <SettingsSubpage title="Ekip ve yetkiler"><TeamSettingsView clinicName={clinic.name} members={team.members} invitations={team.invitations} currentUserId={user.id} actions={{ invite: inviteDietitianAction, revoke: revokeClinicInvitationAction, promote: promoteClinicMemberAction, remove: removeClinicMemberAction }} /></SettingsSubpage>
}

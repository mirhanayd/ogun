import { redirect } from 'next/navigation'
import { UsersRound } from 'lucide-react'
import { db } from '@ogun/db'
import { getClinicById, listClinicTeam } from '@ogun/db/queries'
import { requireClinic } from '@/lib/authz'
import { TeamManager } from './team-manager'

export default async function TeamSettingsPage() {
  const { scope, role } = await requireClinic()
  if (role !== 'owner') redirect('/ayarlar')

  const [clinic, team] = await Promise.all([
    getClinicById(db, scope.clinicId),
    listClinicTeam(db, scope.clinicId),
  ])
  if (!clinic) redirect('/ayarlar')

  return (
    <div className="flex flex-col gap-6 pb-8">
      <header className="border-b border-border/70 pb-6">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-primary uppercase">
          <UsersRound className="size-3.5" />
          {clinic.name}
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
          Ekip ve yetkiler
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
          Diyetisyenleri kliniğinize davet edin ve danışan görünürlüğünü rol bazında güvenle
          yönetin.
        </p>
      </header>
      <TeamManager members={team.members} invitations={team.invitations} />
    </div>
  )
}

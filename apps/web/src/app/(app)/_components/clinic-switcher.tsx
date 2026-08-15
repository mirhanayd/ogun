import { Building2 } from 'lucide-react'
import { db } from '@ogun/db'
import { listClinicMembershipsForUser } from '@ogun/db/queries'
import { requireAuth } from '@/lib/authz'
import { ClinicSwitcherMenu } from './clinic-switcher-menu'

// Async server component — clinic_members verisi burada, akışın geri
// kalanından bağımsız olarak yükleniyor (bkz. top-bar.tsx'teki <Suspense
// fallback={<ClinicSwitcherSkeleton />}>). Kullanıcı yalnızca TEK klinikte
// üyeyse bir açılır menü yerine sade bir etiket gösteriyoruz — gereksiz
// etkileşim eklemiyoruz (bkz. GitHub issue #11 — "birden fazla klinikte
// üyeyse" şartı).
export async function ClinicSwitcher({ activeClinicId }: { activeClinicId: string }) {
  const { user } = await requireAuth()
  const memberships = await listClinicMembershipsForUser(db, user.id)

  if (memberships.length <= 1) {
    const current = memberships[0]
    return (
      <div className="flex items-center gap-2 px-1.5 text-sm font-medium">
        <Building2 className="size-4 text-muted-foreground" />
        <span className="max-w-40 truncate">{current?.clinicName ?? 'Klinik'}</span>
      </div>
    )
  }

  return <ClinicSwitcherMenu memberships={memberships} activeClinicId={activeClinicId} />
}

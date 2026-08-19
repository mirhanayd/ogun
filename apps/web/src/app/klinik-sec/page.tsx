import { redirect } from 'next/navigation'
import { db } from '@ogun/db'
import { listClinicMembershipsForUser } from '@ogun/db/queries'
import { UnauthenticatedError, requireAuth } from '@/lib/authz'
import { ClinicPicker } from './clinic-picker'

// GitHub issue #67 — birden fazla klinikte üye olan bir kullanıcı, oturumu
// henüz bir kliniğe bağlı DEĞİLKEN (yani her taze girişte) buraya düşer.
// requireClinic() tek üyelikte kliniği kendisi seçer; birden fazlasında
// hangisinin kastedildiğini UYDURMAK yerine kullanıcıya sorar.
export default async function KlinikSecPage() {
  let userId: string
  try {
    ;({
      user: { id: userId },
    } = await requireAuth())
  } catch (error) {
    if (error instanceof UnauthenticatedError) redirect('/giris')
    throw error
  }

  const memberships = await listClinicMembershipsForUser(db, userId)
  // Bu ekrana yalnızca "birden fazla üyelik" durumunda gelinir; arada bir
  // üyelik silinmişse kullanıcıyı burada boş bir listeyle bırakmak yerine
  // doğru akışa geri gönder.
  if (memberships.length === 0) redirect('/kurulum')
  if (memberships.length === 1) redirect('/panel')

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <ClinicPicker memberships={memberships} />
    </div>
  )
}

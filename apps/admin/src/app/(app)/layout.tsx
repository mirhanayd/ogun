import { redirect } from 'next/navigation'
import { AdminShell } from '@/components/admin-shell'
import { PlatformAccessError, requirePlatformStaff } from '@/lib/platform-authz'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  let ctx
  try {
    ctx = await requirePlatformStaff()
  } catch (error) {
    if (error instanceof PlatformAccessError) {
      if (error.reason === 'mfa_required') redirect('/guvenlik/iki-asama-kurulum')
      if (error.reason === 'unauthenticated') redirect('/giris')
      redirect('/giris?hata=erisim')
    }
    throw error
  }
  return <AdminShell ctx={ctx}>{children}</AdminShell>
}

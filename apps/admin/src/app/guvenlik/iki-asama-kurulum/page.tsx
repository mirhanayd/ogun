import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { PlatformAccessError, requirePlatformStaff } from '@/lib/platform-authz'
import { EnrollmentForm } from './enrollment-form'

export const metadata: Metadata = { title: 'MFA kurulumu' }
export const dynamic = 'force-dynamic'

export default async function EnrollmentPage() {
  let ctx
  try {
    ctx = await requirePlatformStaff({ allowUnenrolled: true })
  } catch (error) {
    if (error instanceof PlatformAccessError) redirect('/giris?hata=erisim')
    throw error
  }
  if (ctx.mfaEnabled) redirect('/')
  return (
    <main className="auth-shell">
      <section className="auth-card stack">
        <header>
          <div className="brand">Ogun Operasyon</div>
          <h1>Hesabınızı koruyun</h1>
          <p className="muted">Ogun Operasyon hesabınız için iki aşamalı doğrulama zorunludur.</p>
        </header>
        <EnrollmentForm />
      </section>
    </main>
  )
}

import React from 'react'
import { headers } from 'next/headers'
import { db } from '@ogun/db'
import { getClinicalReviewerWithCapabilities } from '@ogun/db/queries'
import { assertClinicalReviewEnabled } from '@/lib/clinical-review/authz'
import { auth } from '@/lib/auth'
import { PortalNav } from './_components/portal-nav'

export const metadata = {
  title: 'Ogun Clinical Review Portal',
  description: 'Klinik Bilgi Tabanı Aday İnceleme ve Uzman Karar Portalı',
}

export default async function ClinicalReviewLayout({ children }: { children: React.ReactNode }) {
  assertClinicalReviewEnabled()

  const session = await auth.api.getSession({ headers: await headers() })
  const authUser = session?.user
  const reviewerProfile = authUser
    ? await getClinicalReviewerWithCapabilities(db, authUser.id)
    : null

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col antialiased">
      {authUser ? <PortalNav user={authUser} profile={reviewerProfile} /> : null}

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {children}
      </main>

      <footer className="border-t border-border/60 py-6 px-4 text-center text-xs text-muted-foreground">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>OGUN Clinical Knowledge Management • Güvenli Uzman İnceleme ve Doğrulama</span>
          <span>Fail-Closed Kanonik Yayınlama Hattı Aktif</span>
        </div>
      </footer>
    </div>
  )
}

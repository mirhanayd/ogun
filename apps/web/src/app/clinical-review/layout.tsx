import React from 'react'
import { redirect } from 'next/navigation'
import { db } from '@ogun/db'
import { getClinicalReviewerWithCapabilities } from '@ogun/db/queries'
import { requireAuth, UnauthenticatedError } from '@/lib/authz'
import { assertClinicalReviewEnabled } from '@/lib/clinical-review/authz'
import { PortalNav } from './_components/portal-nav'
import { RequestRoleCard } from './_components/request-role-card'

export const metadata = {
  title: 'Ogun Clinical Review Portal',
  description: 'Klinik Bilgi Tabanı Aday İnceleme ve Uzman Karar Portalı',
}

export default async function ClinicalReviewLayout({
  children,
}: {
  children: React.ReactNode
}) {
  assertClinicalReviewEnabled()

  let authUser: { id: string; email: string; name: string }
  try {
    const session = await requireAuth()
    authUser = session.user
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      redirect('/giris?next=/clinical-review')
    }
    throw error
  }

  const reviewerProfile = await getClinicalReviewerWithCapabilities(db, authUser.id)

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col antialiased">
      <PortalNav user={authUser} profile={reviewerProfile} />

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {!reviewerProfile ? (
          <RequestRoleCard />
        ) : (
          children
        )}
      </main>

      <footer className="border-t border-border/60 py-6 px-4 text-center text-xs text-muted-foreground">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            OGUN Clinical Knowledge Management • Güvenli Uzman İnceleme ve Doğrulama
          </span>
          <span>Fail-Closed Kanonik Yayınlama Hattı Aktif</span>
        </div>
      </footer>
    </div>
  )
}

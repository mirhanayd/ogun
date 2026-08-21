import type { Metadata } from 'next'
import Link from 'next/link'
import { db } from '@ogun/db'
import { getActiveInvitationByTokenHash } from '@ogun/db/queries'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { hashClinicInvitationToken } from '@/lib/clinic-invitation-token'
import { AcceptInvitationForm } from './accept-invitation-form'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

// Tek kullanımlık token durumu her istekte DB'den okunmalı; statik/full-route
// cache kullanılmış veya iptal edilmiş bir daveti geçerli gösteremez.
export const dynamic = 'force-dynamic'

export default async function ClinicInvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const invitation = token.length <= 256
    ? await getActiveInvitationByTokenHash(db, hashClinicInvitationToken(token))
    : null

  if (!invitation) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Davet bağlantısı geçersiz</CardTitle>
          <CardDescription>Bağlantının süresi dolmuş, davet iptal edilmiş veya daha önce kullanılmış olabilir.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" className="w-full">
            <Link href="/giris">Giriş sayfasına dön</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Diyetisyen daveti</p>
        <CardTitle>{invitation.clinicName} ekibine katılın</CardTitle>
        <CardDescription>
          {invitation.inviterName}, kurum yöneticisi olarak {invitation.name} adına bu daveti gönderdi.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AcceptInvitationForm
          token={token}
          accountExists={invitation.accountExists}
          requiresPassword={invitation.requiresPassword}
        />
      </CardContent>
    </Card>
  )
}

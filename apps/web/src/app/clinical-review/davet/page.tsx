import Link from 'next/link'
import { headers } from 'next/headers'
import { db } from '@ogun/db'
import { getReviewerInvitationPreviewByTokenHash } from '@ogun/db/queries'
import {
  hashClinicalReviewerInvitationToken,
  normalizeClinicalReviewerEmail,
} from '@ogun/db/clinical-reviewer-invitation'
import { auth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { InvitationActivationForm } from './invitation-activation-form'
import { InvitationAccountSwitch } from './invitation-account-switch'

export const dynamic = 'force-dynamic'
export const metadata = { robots: { index: false, follow: false }, referrer: 'no-referrer' }
export default async function ClinicalReviewerInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token = '' } = await searchParams
  const invitation =
    token && token.length <= 256
      ? await getReviewerInvitationPreviewByTokenHash(
          db,
          hashClinicalReviewerInvitationToken(token),
        )
      : null
  const session = await auth.api.getSession({ headers: await headers() })
  if (!invitation || invitation.displayStatus !== 'pending')
    return (
      <InvitationMessage
        title={
          invitation?.displayStatus === 'accepted'
            ? 'Bu davet daha önce kullanılmış.'
            : invitation?.displayStatus === 'revoked'
              ? 'Bu davet iptal edilmiş.'
              : invitation?.displayStatus === 'expired'
                ? 'Bu davetin süresi dolmuş.'
                : 'Davet bağlantısı geçersiz.'
        }
      />
    )
  const invitePath = `/clinical-review/davet?token=${encodeURIComponent(token)}`
  if (
    session &&
    normalizeClinicalReviewerEmail(session.user.email) !==
      normalizeClinicalReviewerEmail(invitation.email)
  )
    return (
      <Card className="mx-auto max-w-lg">
        <CardHeader>
          <CardTitle>Farklı bir hesapla oturum açtınız.</CardTitle>
          <CardDescription>
            Bu davet {invitation.email} adresine aittir. Davet edilen hesapla giriş yapın.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InvitationAccountSwitch next={invitePath} />
        </CardContent>
      </Card>
    )
  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">
          Ogun Clinical Review
        </p>
        <CardTitle>Hakem hesabınızı etkinleştirin</CardTitle>
        <CardDescription>
          Merhaba {invitation.name}. Bu sayfa yalnızca hesap aktivasyonunu tamamlar; görev ve klinik
          içerik göstermez.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {session ? (
          <InvitationActivationForm
            token={token}
            email={invitation.email}
            name={invitation.name}
            createAccount={false}
          />
        ) : invitation.accountExists ? (
          <>
            <p className="text-sm text-muted-foreground">
              Bu e-posta için mevcut hesap bulundu. Daveti kabul etmek için aynı hesapla giriş
              yapın.
            </p>
            <Button asChild className="w-full">
              <Link href={`/giris?next=${encodeURIComponent(invitePath)}`}>Giriş yap</Link>
            </Button>
          </>
        ) : (
          <InvitationActivationForm
            token={token}
            email={invitation.email}
            name={invitation.name}
            createAccount
          />
        )}
      </CardContent>
    </Card>
  )
}
function InvitationMessage({ title, description }: { title: string; description?: string }) {
  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {description ?? 'Yeni bir davet için Ogun Operasyon ekibiyle iletişime geçin.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline" className="w-full">
          <Link href="/giris">Giriş sayfasına dön</Link>
        </Button>
      </CardContent>
    </Card>
  )
}

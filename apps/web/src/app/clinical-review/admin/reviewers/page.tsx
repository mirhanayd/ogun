import Link from 'next/link'
import { requireClinicalAdmin } from '@/lib/clinical-review/authz'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default async function LegacyReviewerManagementPage() {
  await requireClinicalAdmin()
  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader>
        <CardTitle>Hakem yönetimi taşındı</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Davet, mesleki doğrulama, yetkinlik ve görev atama işlemleri artık yalnızca ayrı Ogun
          Operasyon uygulamasında platform yetkileriyle yönetilir.
        </p>
        <Button asChild variant="outline">
          <Link href="/clinical-review">Clinical Review portalına dön</Link>
        </Button>
      </CardContent>
    </Card>
  )
}

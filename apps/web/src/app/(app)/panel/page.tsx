import Link from 'next/link'
import { CalendarDays, PackageX, TrendingDown, Weight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getPanelNotificationFeed } from './queries'

// GitHub issue #41 / Prompt 7.3, GÖREV 4 — "Bugünün randevuları, gelmeyen
// danışanlar, 2 haftadır ölçüm girmemiş danışanlar, süresi dolan paketler.
// Panel (dashboard) sayfasında özet kartlar." Önceki (GitHub #11) "Panel
// yakında burada" boş durumu BURADA dolduruluyor.
export default async function PanelPage() {
  const feed = await getPanelNotificationFeed()

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Panel</h1>
        <p className="text-sm text-muted-foreground">Bugüne dair özet ve dikkat gerektiren durumlar.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          icon={CalendarDays}
          label="Bugünün randevuları"
          value={feed.todayAppointmentsCount}
          href="/randevular"
          tone="neutral"
        />
        <SummaryCard
          icon={TrendingDown}
          label="Gelmeyen danışan (son 7 gün)"
          value={feed.noShowCount}
          href="/randevular"
          tone={feed.noShowCount > 0 ? 'warning' : 'neutral'}
        />
        <SummaryCard
          icon={Weight}
          label="2+ haftadır ölçüm girilmemiş"
          value={feed.staleMeasurementCount}
          href="/danisanlar"
          tone={feed.staleMeasurementCount > 0 ? 'warning' : 'neutral'}
        />
        <SummaryCard
          icon={PackageX}
          label="Süresi yaklaşan/dolan paket"
          value={feed.expiringPackageCount}
          href="/finans"
          tone={feed.expiringPackageCount > 0 ? 'warning' : 'neutral'}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ölçüm girilmemiş danışanlar</CardTitle>
            <CardDescription>Son ölçümü 14 günden eski olan (veya hiç ölçümü olmayan) aktif danışanlar.</CardDescription>
          </CardHeader>
          <CardContent>
            {feed.staleMeasurementClients.length === 0 ? (
              <p className="text-sm text-muted-foreground">Tüm aktif danışanların güncel ölçümü var.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {feed.staleMeasurementClients.slice(0, 8).map((client) => (
                  <li key={client.clientId} className="flex items-center justify-between text-sm">
                    <Link href={`/danisanlar/${client.clientId}`} className="hover:underline">
                      {client.firstName} {client.lastName}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {client.lastMeasuredAt
                        ? `Son ölçüm: ${client.lastMeasuredAt.toLocaleDateString('tr-TR')}`
                        : 'Hiç ölçüm yok'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Süresi yaklaşan/dolan paketler</CardTitle>
            <CardDescription>Önümüzdeki 7 gün içinde dolacak veya süresi zaten dolmuş paketler.</CardDescription>
          </CardHeader>
          <CardContent>
            {feed.expiringPackages.length === 0 ? (
              <p className="text-sm text-muted-foreground">Yaklaşan/dolmuş paket yok.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {feed.expiringPackages.slice(0, 8).map((pkg) => (
                  <li key={pkg.clientPackageId} className="flex items-center justify-between text-sm">
                    <Link href={`/danisanlar/${pkg.clientId}`} className="hover:underline">
                      {pkg.clientFirstName} {pkg.clientLastName} — {pkg.packageName}
                    </Link>
                    <Badge variant={pkg.state === 'süresi_doldu' ? 'destructive' : 'secondary'}>
                      {pkg.state === 'süresi_doldu' ? 'Süresi doldu' : 'Yakında dolacak'}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  href,
  tone,
}: {
  icon: typeof CalendarDays
  label: string
  value: number
  href: string
  tone: 'neutral' | 'warning'
}) {
  const toneClass = tone === 'warning' && value > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'
  return (
    <Link href={href}>
      <Card className="transition-colors hover:bg-muted/50">
        <CardContent className="flex items-center gap-3 py-4">
          <Icon className={`size-5 ${toneClass}`} />
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`text-lg font-semibold ${toneClass}`}>{value}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

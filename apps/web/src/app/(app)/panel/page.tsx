import Link from 'next/link'
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  PackageX,
  Plus,
  Sparkles,
  TrendingDown,
  UserPlus,
  Weight,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getPanelNotificationFeed } from './queries'

const dateFormatter = new Intl.DateTimeFormat('tr-TR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'Europe/Istanbul',
})

const hourFormatter = new Intl.DateTimeFormat('tr-TR', {
  hour: 'numeric',
  hourCycle: 'h23',
  timeZone: 'Europe/Istanbul',
})

const appointmentDateFormatter = new Intl.DateTimeFormat('tr-TR', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Istanbul',
})

const appointmentTypeLabels = {
  ilk_görüşme: 'İlk görüşme',
  kontrol: 'Kontrol',
  online: 'Online',
  ölçüm: 'Ölçüm',
} as const

export default async function PanelPage() {
  const feed = await getPanelNotificationFeed()
  const now = new Date()
  const hour = Number(hourFormatter.format(now))
  const greeting = hour < 12 ? 'Günaydın' : hour < 18 ? 'İyi günler' : 'İyi akşamlar'
  const attentionCount = feed.noShowCount + feed.staleMeasurementCount + feed.expiringPackageCount

  return (
    <div className="flex flex-col gap-7 pb-8">
      <section className="flex flex-col gap-5 border-b border-border/70 pb-7 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-primary uppercase">
            <Sparkles className="size-3.5" />
            Klinik özeti
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.035em] text-balance sm:text-4xl">
            {greeting}
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            {attentionCount > 0
              ? `Bugün ${attentionCount} konu dikkatinizi bekliyor. Öncelikleri sizin için tek yerde topladık.`
              : 'Klinik akışınız güncel görünüyor. Bugünün programına hazırsınız.'}
          </p>
          <div className="flex items-center gap-2 pt-1 text-sm font-medium text-muted-foreground">
            <CalendarDays className="size-4" />
            <span className="first-letter:uppercase">{dateFormatter.format(now)}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            asChild
            variant="outline"
            size="lg"
            className="rounded-xl bg-background/80 px-4 shadow-xs"
          >
            <Link href="/randevular">
              <CalendarDays data-icon="inline-start" />
              Takvimi aç
            </Link>
          </Button>
          <Button asChild size="lg" className="rounded-xl px-4 shadow-sm shadow-primary/15">
            <Link href="/danisanlar/yeni">
              <UserPlus data-icon="inline-start" />
              Yeni danışan
            </Link>
          </Button>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={CalendarDays}
          eyebrow="Bugün"
          label="Randevu"
          value={feed.todayAppointmentsCount}
          detail={feed.todayAppointmentsCount > 0 ? 'Programınız hazır' : 'Planlanmış randevu yok'}
          href="/randevular"
          tone="brand"
        />
        <SummaryCard
          icon={TrendingDown}
          eyebrow="Son 7 gün"
          label="Gelmeyen danışan"
          value={feed.noShowCount}
          detail={feed.noShowCount > 0 ? 'Takip edilmesi önerilir' : 'Kaçırılan randevu yok'}
          href="/randevular"
          tone={feed.noShowCount > 0 ? 'warning' : 'calm'}
        />
        <SummaryCard
          icon={Weight}
          eyebrow="Ölçüm takibi"
          label="Güncelleme bekliyor"
          value={feed.staleMeasurementCount}
          detail={feed.staleMeasurementCount > 0 ? '14 günden uzun süredir' : 'Tüm ölçümler güncel'}
          href="/danisanlar"
          tone={feed.staleMeasurementCount > 0 ? 'warning' : 'calm'}
        />
        <SummaryCard
          icon={PackageX}
          eyebrow="Önümüzdeki 7 gün"
          label="Biten paket"
          value={feed.expiringPackageCount}
          detail={
            feed.expiringPackageCount > 0 ? 'Yenileme görüşmesi gerekebilir' : 'Yaklaşan bitiş yok'
          }
          href={feed.canManageFinance ? '/finans' : '/danisanlar'}
          tone={feed.expiringPackageCount > 0 ? 'warning' : 'calm'}
        />
      </section>

      <section>
        <Card className="overflow-hidden border-border/70 bg-card/90 shadow-sm shadow-foreground/[0.03]">
          <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-border/60 px-5 py-5 sm:px-6">
            <div className="space-y-1.5">
              <CardTitle className="text-base tracking-tight">Yaklaşan randevular</CardTitle>
              <CardDescription>Önümüzdeki 7 gün içindeki planlanmış görüşmeler</CardDescription>
            </div>
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="-mr-2 rounded-lg text-muted-foreground"
            >
              <Link href="/randevular">
                Takvimi aç
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {feed.upcomingAppointments.length === 0 ? (
              <div className="flex min-h-36 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
                <span className="flex size-11 items-center justify-center rounded-2xl bg-primary/8 text-primary ring-1 ring-primary/10">
                  <CalendarDays className="size-5" />
                </span>
                <div>
                  <p className="text-sm font-medium">Yaklaşan randevu yok</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Önümüzdeki 7 gün için programınız boş.
                  </p>
                </div>
              </div>
            ) : (
              <ul className="grid md:grid-cols-2 xl:grid-cols-3">
                {feed.upcomingAppointments.map((appointment) => (
                  <li
                    key={appointment.id}
                    className="border-border/60 md:border-r md:nth-[2n]:border-r-0 xl:nth-[2n]:border-r xl:nth-[3n]:border-r-0 [&:nth-child(n+3)]:border-t xl:[&:nth-child(3)]:border-t-0"
                  >
                    <Link
                      href="/randevular"
                      className="group flex h-full items-start gap-3 px-5 py-4 transition-colors hover:bg-muted/45 sm:px-6"
                    >
                      <span className="flex size-10 shrink-0 flex-col items-center justify-center rounded-xl bg-primary/8 text-primary ring-1 ring-primary/10">
                        <Clock3 className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2">
                          <span className="truncate text-sm font-medium">
                            {appointment.clientFirstName} {appointment.clientLastName}
                          </span>
                          <Badge
                            variant={appointment.status === 'ertelendi' ? 'outline' : 'secondary'}
                          >
                            {appointment.status === 'ertelendi' ? 'Ertelendi' : 'Planlandı'}
                          </Badge>
                        </span>
                        <span className="mt-1 block text-xs font-medium text-primary first-letter:uppercase">
                          {appointmentDateFormatter.format(appointment.startsAt)}
                        </span>
                        <span className="mt-1 block truncate text-xs text-muted-foreground">
                          {appointmentTypeLabels[appointment.type]} · {appointment.dietitianName}
                          {appointment.location ? ` · ${appointment.location}` : ''}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.55fr)]">
        <Card className="overflow-hidden border-border/70 bg-card/90 shadow-sm shadow-foreground/[0.03]">
          <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-border/60 px-5 py-5 sm:px-6">
            <div className="space-y-1.5">
              <CardTitle className="text-base tracking-tight">Ölçüm takibi</CardTitle>
              <CardDescription>Takip rutini aksayan aktif danışanlar</CardDescription>
            </div>
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="-mr-2 rounded-lg text-muted-foreground"
            >
              <Link href="/danisanlar">
                Tümünü gör
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {feed.staleMeasurementClients.length === 0 ? (
              <SuccessState label="Tüm aktif danışanların ölçümleri güncel." />
            ) : (
              <ul className="divide-y divide-border/60">
                {feed.staleMeasurementClients.slice(0, 7).map((client) => (
                  <li key={client.clientId}>
                    <Link
                      href={`/danisanlar/${client.clientId}`}
                      className="group flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-muted/45 sm:px-6"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-sm font-semibold text-primary ring-1 ring-primary/10">
                        {client.firstName.slice(0, 1)}
                        {client.lastName.slice(0, 1)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {client.firstName} {client.lastName}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Clock3 className="size-3" />
                          {client.lastMeasuredAt
                            ? `Son ölçüm ${client.lastMeasuredAt.toLocaleDateString('tr-TR')}`
                            : 'Henüz ölçüm girilmedi'}
                        </span>
                      </span>
                      <ArrowRight className="size-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card className="overflow-hidden border-primary/15 bg-primary text-primary-foreground shadow-lg shadow-primary/10">
            <CardContent className="relative flex min-h-48 flex-col justify-between p-6">
              <div className="pointer-events-none absolute -top-16 -right-12 size-44 rounded-full bg-primary-foreground/8 blur-2xl" />
              <div className="relative">
                <div className="mb-5 flex size-10 items-center justify-center rounded-2xl bg-primary-foreground/12 ring-1 ring-primary-foreground/15">
                  <Plus className="size-5" />
                </div>
                <p className="text-xs font-semibold tracking-[0.14em] text-primary-foreground/65 uppercase">
                  Hızlı başlangıç
                </p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight">
                  Yeni danışan kaydı oluşturun
                </h2>
                <p className="mt-2 max-w-sm text-sm leading-6 text-primary-foreground/70">
                  Temel bilgileri ekleyin, ilk ölçümü alın ve bakım planını tek akışta başlatın.
                </p>
              </div>
              <Button asChild variant="secondary" className="relative mt-5 w-fit rounded-xl px-4">
                <Link href="/danisanlar/yeni">
                  Kayıt oluştur
                  <ArrowRight data-icon="inline-end" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-sm shadow-foreground/[0.03]">
            <CardHeader className="pb-3">
              <CardTitle className="text-base tracking-tight">Paket görünümü</CardTitle>
              <CardDescription>Yakında süresi dolacak bakım paketleri</CardDescription>
            </CardHeader>
            <CardContent>
              {feed.expiringPackages.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                  Yaklaşan veya geçmiş paket yok.
                </div>
              ) : (
                <ul className="space-y-3">
                  {feed.expiringPackages.slice(0, 4).map((pkg) => {
                    const expired = pkg.expiresAt.getTime() < now.getTime()
                    return (
                      <li
                        key={pkg.clientPackageId}
                        className="flex items-center justify-between gap-3"
                      >
                        <Link
                          href={`/danisanlar/${pkg.clientId}`}
                          className="min-w-0 hover:underline"
                        >
                          <span className="block truncate text-sm font-medium">
                            {pkg.clientFirstName} {pkg.clientLastName}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {pkg.packageName}
                          </span>
                        </Link>
                        <Badge variant={expired ? 'destructive' : 'secondary'}>
                          {expired ? 'Süresi doldu' : 'Yaklaşıyor'}
                        </Badge>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}

function SummaryCard({
  icon: Icon,
  eyebrow,
  label,
  value,
  detail,
  href,
  tone,
}: {
  icon: typeof CalendarDays
  eyebrow: string
  label: string
  value: number
  detail: string
  href: string
  tone: 'brand' | 'warning' | 'calm'
}) {
  const iconClass = {
    brand: 'bg-primary/10 text-primary ring-primary/15',
    warning: 'bg-amber-500/10 text-amber-700 ring-amber-500/15 dark:text-amber-300',
    calm: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/15 dark:text-emerald-300',
  }[tone]

  return (
    <Link
      href={href}
      className="group min-w-0 rounded-2xl focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Card className="h-full border-border/70 bg-card/85 shadow-sm shadow-foreground/[0.025] transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/20 group-hover:shadow-md group-hover:shadow-foreground/[0.045]">
        <CardContent className="flex h-full flex-col gap-5 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[0.69rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                {eyebrow}
              </p>
              <p className="mt-1.5 text-sm font-medium text-foreground/80">{label}</p>
            </div>
            <span
              className={`flex size-9 shrink-0 items-center justify-center rounded-xl ring-1 ${iconClass}`}
            >
              <Icon className="size-4" />
            </span>
          </div>
          <div className="mt-auto flex items-end justify-between gap-3">
            <div>
              <p className="text-3xl font-semibold tracking-[-0.05em] tabular-nums">{value}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
            </div>
            <ArrowRight className="mb-1 size-4 shrink-0 text-muted-foreground/45 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

function SuccessState({ label }: { label: string }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <span className="flex size-11 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/15 dark:text-emerald-300">
        <CheckCircle2 className="size-5" />
      </span>
      <div>
        <p className="text-sm font-medium">Takip listesi temiz</p>
        <p className="mt-1 text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

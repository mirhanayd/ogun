import Link from 'next/link'
import {
  ArrowRight,
  Building2,
  Clock3,
  MapPin,
  MessageSquareText,
  Palette,
  Phone,
  Settings2,
  Share2,
  ShieldCheck,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import { db } from '@ogun/db'
import { getClinicById, getWorkingHoursForClinic } from '@ogun/db/queries'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { requireClinic } from '@/lib/authz'
import { WEEKDAYS_TR } from '@/lib/onboarding'
import { DesktopSettingsCard } from './desktop-settings-card'

export default async function AyarlarPage() {
  const { scope, role } = await requireClinic()
  const [clinic, workingHours] = await Promise.all([
    getClinicById(db, scope.clinicId),
    getWorkingHoursForClinic(db, scope.clinicId),
  ])

  if (!clinic) {
    return <p className="text-sm text-muted-foreground">Klinik bulunamadı.</p>
  }

  const hoursByDay = new Map(workingHours.map((row) => [row.dayOfWeek, row]))

  return (
    <div className="flex flex-col gap-6 pb-8">
      <header className="border-b border-border/70 pb-6">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-primary uppercase">
          <Settings2 className="size-3.5" />
          Klinik çalışma alanı
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">Ayarlar</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
          Kliniğinizin kimliğini, çalışma düzenini ve ekip erişimlerini tek yerden yönetin.
        </p>
      </header>

      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <div className="grid min-w-0 content-start gap-4">
          <Card className="border-border/70 bg-card/90 shadow-sm shadow-foreground/[0.03]">
            <CardHeader className="border-b border-border/60 px-5 py-5 sm:px-6">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/9 text-primary ring-1 ring-primary/12">
                  <Building2 className="size-4.5" />
                </span>
                <div>
                  <CardTitle className="tracking-tight">Klinik kimliği</CardTitle>
                  <CardDescription className="mt-1">
                    Danışan iletişiminde ve klinik belgelerinde kullanılan bilgiler
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-5 p-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:p-6">
              <div className="flex size-20 items-center justify-center overflow-hidden rounded-2xl border border-border/70 bg-muted/45 shadow-inner">
                {clinic.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- data URI'ler next/image ile optimize edilemez.
                  <img
                    src={clinic.logoUrl}
                    alt={`${clinic.name} logosu`}
                    className="size-full object-contain"
                  />
                ) : (
                  <span className="text-xl font-semibold text-primary">
                    {clinic.name
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((part) => part[0])
                      .join('')
                      .toLocaleUpperCase('tr-TR')}
                  </span>
                )}
              </div>
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <SettingsField
                  icon={Building2}
                  label="Klinik adı"
                  value={clinic.name}
                  className="sm:col-span-2"
                />
                <SettingsField icon={Phone} label="Telefon" value={clinic.phone} />
                <SettingsField
                  icon={Palette}
                  label="Marka rengi"
                  value={clinic.primaryColor}
                  color={clinic.primaryColor}
                />
                <SettingsField
                  icon={MapPin}
                  label="Adres"
                  value={clinic.address}
                  className="sm:col-span-2"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/90 shadow-sm shadow-foreground/[0.03]">
            <CardHeader className="border-b border-border/60 px-5 py-5 sm:px-6">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/9 text-primary ring-1 ring-primary/12">
                  <Clock3 className="size-4.5" />
                </span>
                <div>
                  <CardTitle className="tracking-tight">Çalışma saatleri</CardTitle>
                  <CardDescription className="mt-1">
                    Randevu uygunluğu için kullanılan haftalık düzen
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {WEEKDAYS_TR.map((day, index) => {
                const hour = hoursByDay.get(day.value)
                return (
                  <div key={day.value}>
                    {index > 0 && <Separator />}
                    <div className="flex items-center justify-between gap-4 px-5 py-3.5 text-sm sm:px-6">
                      <span className="font-medium">{day.label}</span>
                      {hour?.isOpen ? (
                        <span className="rounded-lg bg-muted/55 px-2.5 py-1 text-xs font-medium tabular-nums text-muted-foreground">
                          {hour.startTime.slice(0, 5)} — {hour.endTime.slice(0, 5)}
                        </span>
                      ) : (
                        <Badge variant="secondary">Kapalı</Badge>
                      )}
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </div>

        <div className="grid min-w-0 content-start gap-3">
          {role === 'owner' && (
            <SettingsLinkCard
              icon={UsersRound}
              title="Ekip ve yetkiler"
              description="Diyetisyen davetlerini gönderin ve kurum erişimlerini görüntüleyin."
              href="/ayarlar/ekip"
              accent
            />
          )}
          {role === 'owner' && (
            <SettingsLinkCard
              icon={MessageSquareText}
              title="Randevu hatırlatmaları"
              description="SMS metnini düzenleyin ve gönderim akışını kontrol edin."
              href="/ayarlar/hatirlatmalar"
            />
          )}
          {role === 'owner' && (
            <>
              <SettingsLinkCard
                icon={Share2}
                title="Plan paylaşımı"
                description="WhatsApp üzerinden gönderilen plan mesajını kişiselleştirin."
                href="/ayarlar/paylasim"
              />
              <SettingsLinkCard
                icon={ShieldCheck}
                title="Veri güvenliği ve KVKK"
                description="Erişim kayıtlarını ve veri saklama politikasını yönetin."
                href="/ayarlar/veri-guvenligi"
              />
            </>
          )}
          <DesktopSettingsCard />
        </div>
      </section>
    </div>
  )
}

function SettingsField({
  icon: Icon,
  label,
  value,
  color,
  className,
}: {
  icon: LucideIcon
  label: string
  value: string | null
  color?: string | null
  className?: string
}) {
  return (
    <div className={className}>
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </p>
      <div className="mt-1.5 flex min-w-0 items-center gap-2">
        {color && (
          <span
            className="size-3.5 shrink-0 rounded-full ring-1 ring-border"
            style={{ backgroundColor: color }}
          />
        )}
        <p className="truncate text-sm font-medium">{value || 'Belirtilmedi'}</p>
      </div>
    </div>
  )
}

function SettingsLinkCard({
  icon: Icon,
  title,
  description,
  href,
  accent = false,
}: {
  icon: LucideIcon
  title: string
  description: string
  href: string
  accent?: boolean
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Card
        className={`h-full py-0 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-md ${
          accent
            ? 'border-primary/20 bg-primary/[0.045] shadow-sm shadow-primary/5'
            : 'border-border/70 bg-card/90 shadow-sm shadow-foreground/[0.03]'
        }`}
      >
        <CardContent className="flex items-center gap-4 p-5">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/9 text-primary ring-1 ring-primary/12">
            <Icon className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium tracking-tight">{title}</span>
            <span className="mt-1 block text-sm leading-5 text-muted-foreground">
              {description}
            </span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground/45 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
        </CardContent>
      </Card>
    </Link>
  )
}

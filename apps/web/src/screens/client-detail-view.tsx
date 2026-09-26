import type { ReactNode } from 'react'
import { ArrowLeft, CircleAlert, Mail, Phone } from 'lucide-react'
import { NavigationLink } from '@/components/navigation-link'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  OgunCalendar,
  OgunClients,
  OgunFinance,
  OgunFolder,
  OgunHealth,
  OgunLab,
  OgunMeasure,
  OgunPlan,
  type OgunIconComponent,
} from '@/components/ogun-icons'

export interface ClientDetailTab {
  value: string
  label: string
  content: ReactNode
}
export interface ClientSummaryStat {
  label: string
  value: string
}

const tabIcons: Record<string, OgunIconComponent> = {
  genel: OgunClients,
  olcumler: OgunMeasure,
  planlar: OgunPlan,
  anamnez: OgunHealth,
  laboratuvar: OgunLab,
  dosyalar: OgunFolder,
  randevular: OgunCalendar,
  odemeler: OgunFinance,
}

export function ClientDetailView({
  name,
  ageLabel,
  sexLabel,
  phone,
  email,
  alerts = [],
  notice,
  summary,
  tabs,
  quickActions,
}: {
  name: string
  ageLabel: string
  sexLabel?: string | null
  phone?: string | null
  email?: string | null
  alerts?: ReactNode[]
  notice?: ReactNode
  summary: ClientSummaryStat[]
  tabs: ClientDetailTab[]
  quickActions?: ReactNode
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toLocaleUpperCase('tr-TR')
  return (
    <div className="flex min-w-0 flex-col gap-5" data-client-detail>
      <NavigationLink
        href="/danisanlar"
        className="flex min-h-9 w-fit items-center gap-2 rounded-md text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Danışanlar
      </NavigationLink>
      <section
        aria-label="Danışan özeti"
        className="overflow-hidden rounded-xl border border-border bg-card"
      >
        <header className="flex flex-col gap-5 p-4 sm:p-5 xl:flex-row xl:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-4">
            <Avatar className="size-14 shrink-0 rounded-xl">
              <AvatarFallback className="rounded-xl bg-secondary text-lg text-secondary-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <h1 className="text-title break-words">{name}</h1>
                <Badge variant="secondary">{ageLabel}</Badge>
                {sexLabel ? <Badge variant="outline">{sexLabel}</Badge> : null}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                {phone ? (
                  <a
                    href={`tel:${phone.replace(/[^+\d]/g, '')}`}
                    className="inline-flex min-h-7 items-center gap-2 hover:text-foreground"
                  >
                    <Phone className="size-3.5" aria-hidden="true" />
                    {phone}
                  </a>
                ) : (
                  <span>Telefon eklenmemiş</span>
                )}
                {email ? (
                  <a
                    href={`mailto:${email}`}
                    className="inline-flex min-w-0 items-center gap-2 break-all hover:text-foreground"
                  >
                    <Mail className="size-3.5 shrink-0" aria-hidden="true" />
                    {email}
                  </a>
                ) : null}
              </div>
            </div>
          </div>
          {quickActions ? (
            <div
              aria-label="Danışan işlemleri"
              className="client-quick-actions flex flex-wrap gap-2"
            >
              {quickActions}
            </div>
          ) : null}
        </header>
        <dl className="client-summary grid grid-cols-2 border-t border-border bg-muted/30 sm:grid-cols-4">
          {summary.map((stat) => (
            <div
              key={stat.label}
              className="min-w-0 border-r border-border px-4 py-4 last:border-r-0 sm:px-5"
            >
              <dt className="text-xs text-muted-foreground">{stat.label}</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums">{stat.value}</dd>
            </div>
          ))}
        </dl>
      </section>
      {alerts.length > 0 || notice ? (
        <section
          aria-label="Klinik bildirimler"
          className="rounded-lg border border-border border-l-4 border-l-destructive bg-card p-4"
        >
          {alerts.length > 0 ? (
            <ul className="flex flex-wrap gap-x-5 gap-y-2">
              {alerts.map((alert, index) => (
                <li key={index} className="flex items-center gap-2 text-sm font-medium">
                  <CircleAlert className="size-4 shrink-0 text-destructive" aria-hidden="true" />
                  {alert}
                </li>
              ))}
            </ul>
          ) : null}
          {notice ? <div className="mt-2 text-sm">{notice}</div> : null}
        </section>
      ) : null}
      <Tabs defaultValue={tabs[0]?.value} className="client-tabs min-w-0 gap-0">
        <TabsList aria-label="Danışan dosyası bölümleri" className="client-tab-list">
          {tabs.map((tab) => {
            const Icon = tabIcons[tab.value]
            return (
              <TabsTrigger key={tab.value} value={tab.value} className="client-tab">
                {Icon ? <Icon className="size-[1.125rem]" /> : null}
                {tab.label}
              </TabsTrigger>
            )
          })}
        </TabsList>
        {tabs.map((tab) => (
          <TabsContent key={tab.value} value={tab.value} className="min-w-0 pt-5">
            {tab.content}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

export function ClientDetailLoadingView() {
  return (
    <div
      className="grid min-h-80 place-items-center rounded-xl border border-border bg-card text-sm text-muted-foreground"
      role="status"
    >
      Danışan yükleniyor…
    </div>
  )
}

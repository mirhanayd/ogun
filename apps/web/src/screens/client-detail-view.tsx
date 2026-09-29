import type { ReactNode } from 'react'
import { ArrowLeft, CircleAlert, Mail, Phone } from 'lucide-react'
import { NavigationLink } from '@/components/navigation-link'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export interface ClientDetailTab {
  value: string
  label: string
  content: ReactNode
}
export interface ClientSummaryStat {
  label: string
  value: string
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
      <section aria-label="Danışan özeti">
        <header className="flex flex-col gap-5 pb-5 xl:flex-row xl:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-4">
            <Avatar className="size-11 shrink-0">
              <AvatarFallback className="bg-muted text-sm font-semibold text-muted-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <h1 className="break-words text-xl font-medium tracking-[-0.02em]">{name}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {ageLabel}
                {sexLabel ? ` · ${sexLabel}` : ''}
              </p>
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
        <dl className="client-summary grid grid-cols-2 divide-x divide-border border-y border-border sm:grid-cols-4">
          {summary.map((stat) => (
            <div key={stat.label} className="min-w-0 px-4 py-4 first:pl-0 last:pr-0 sm:px-5">
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
        <TabsList
          variant="line"
          aria-label="Danışan dosyası bölümleri"
          className="h-auto w-full justify-start gap-6 overflow-x-auto rounded-none border-0 bg-transparent p-0"
        >
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="h-auto min-h-11 flex-none rounded-none border-0 border-b-2 border-transparent px-0 pt-0 pb-2 text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              {tab.label}
            </TabsTrigger>
          ))}
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

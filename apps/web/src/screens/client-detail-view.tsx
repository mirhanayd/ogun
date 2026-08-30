import type { ReactNode } from 'react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
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
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toLocaleUpperCase('tr-TR')
  return (
    <div className="flex flex-col gap-4" data-client-detail>
      <Card>
        <CardContent className="flex flex-wrap items-center gap-4">
          <Avatar size="lg"><AvatarFallback>{initials}</AvatarFallback></Avatar>
          <div className="min-w-0 flex-1 sm:flex-none">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold">{name}</h1>
              <Badge variant="secondary">{ageLabel}</Badge>
              {sexLabel ? <Badge variant="outline">{sexLabel}</Badge> : null}
              {alerts.map((alert, index) => <Badge key={index} variant="destructive">{alert}</Badge>)}
            </div>
            <p className="text-sm text-muted-foreground">{phone || 'Telefon —'} {email ? `· ${email}` : ''}</p>
            {notice}
          </div>
          <div className="grid w-full grid-cols-2 gap-x-6 gap-y-3 border-t border-border/60 pt-4 text-sm sm:ml-auto sm:w-auto sm:grid-cols-4 sm:border-0 sm:pt-0">
            {summary.map((stat) => <SummaryStat key={stat.label} {...stat} />)}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_240px]">
        <Tabs defaultValue={tabs[0]?.value} className="min-w-0">
          <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            <TabsList className="min-w-max justify-start">
              {tabs.map((tab) => <TabsTrigger key={tab.value} value={tab.value} className="flex-none">{tab.label}</TabsTrigger>)}
            </TabsList>
          </div>
          {tabs.map((tab) => <TabsContent key={tab.value} value={tab.value} className="mt-4">{tab.content}</TabsContent>)}
        </Tabs>
        <Card><CardContent className="flex flex-col gap-2"><p className="text-sm font-medium">Hızlı eylemler</p>{quickActions}</CardContent></Card>
      </div>
    </div>
  )
}

function SummaryStat({ label, value }: ClientSummaryStat) {
  return <div className="flex flex-col"><span className="text-xs text-muted-foreground">{label}</span><span className="font-medium">{value}</span></div>
}

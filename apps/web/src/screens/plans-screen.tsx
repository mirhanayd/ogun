import { NavigationLink as Link } from '@/components/navigation-link'
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileClock,
  Layers3,
  UserRoundSearch,
  type LucideIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/empty-state'
import { PLAN_STATUS_LABELS_TR } from '@/lib/validation/plan-schemas'

export interface PlanScreenRow {
  id: string
  clientId: string | null
  name: string
  status: 'taslak' | 'aktif' | 'arşiv'
  isTemplate: boolean
  endDate: Date | null
  updatedAt: Date
  targetKcal: number | null
}

type PlanRow = PlanScreenRow

const MAX_QUEUE_ITEMS = 6
const MAX_RECENT_ITEMS = 5
const ENDING_SOON_DAYS = 14
const DAY_IN_MS = 24 * 60 * 60 * 1000

const dateFormatter = new Intl.DateTimeFormat('tr-TR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Europe/Istanbul',
})

export function PlansScreen({ plans: sourcePlans, templates, clientNames: names, error, now = new Date() }: { plans: PlanScreenRow[]; templates: PlanScreenRow[] | null; clientNames: Record<string, string>; error?: string | null; now?: Date }) {
  if (error) {
    return (
      <PageFrame>
        <PlanPageHeader />
        <Card className="border-destructive/25 bg-destructive/5">
          <CardContent className="flex items-start gap-3 p-5 sm:p-6" role="alert">
            <AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive" />
            <div>
              <p className="font-medium">Planlar yüklenemedi</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {error}
              </p>
            </div>
          </CardContent>
        </Card>
      </PageFrame>
    )
  }

  const deadline = new Date(now.getTime() + ENDING_SOON_DAYS * DAY_IN_MS)
  const plans = sourcePlans.filter(
    (plan): plan is PlanRow & { clientId: string } => !plan.isTemplate && plan.clientId !== null,
  )

  const activeCount = plans.filter((plan) => plan.status === 'aktif').length
  const draftCount = plans.filter((plan) => plan.status === 'taslak').length
  const endingSoonCount = plans.filter(
    (plan) => plan.status === 'aktif' && plan.endDate !== null && plan.endDate <= deadline,
  ).length

  const attentionCandidates = plans
    .filter(
      (plan) =>
        plan.status === 'taslak' ||
        (plan.status === 'aktif' && plan.endDate !== null && plan.endDate <= deadline),
    )
    .sort((left, right) => {
      const priorityDifference = attentionPriority(left, now) - attentionPriority(right, now)
      return priorityDifference || right.updatedAt.getTime() - left.updatedAt.getTime()
    })
    .slice(0, MAX_QUEUE_ITEMS)

  const attentionIds = new Set(attentionCandidates.map((plan) => plan.id))
  const recentCandidates = [...plans]
    .filter((plan) => plan.status !== 'arşiv' && !attentionIds.has(plan.id))
    .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
    .slice(0, MAX_RECENT_ITEMS)

  const clientNames = new Map(Object.entries(names))

  const attentionPlans = attentionCandidates.filter((plan) => clientNames.has(plan.clientId))
  const recentPlans = recentCandidates.filter((plan) => clientNames.has(plan.clientId))

  return (
    <PageFrame>
      <PlanPageHeader />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Plan özeti">
        <MetricCard icon={CheckCircle2} label="Aktif plan" value={activeCount} />
        <MetricCard icon={FileClock} label="Tamamlanacak taslak" value={draftCount} />
        <MetricCard
          icon={CalendarClock}
          label="Bitişi yaklaşan veya geçen"
          value={endingSoonCount}
        />
        <MetricCard
          icon={Layers3}
          label="Klinik şablonu"
          value={templates === null ? '—' : templates.length}
        />
      </section>

      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <Card className="min-w-0 overflow-hidden border-border/70 bg-card/90 shadow-sm shadow-foreground/[0.03]">
          <CardHeader className="border-b border-border/60 px-5 py-5 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base tracking-tight">Çalışma kuyruğu</CardTitle>
                <CardDescription className="mt-1">
                  Tamamlanacak taslaklar ve bitiş tarihi yaklaşan aktif programlar
                </CardDescription>
              </div>
              {attentionCandidates.length > MAX_QUEUE_ITEMS && (
                <Badge variant="secondary">İlk {MAX_QUEUE_ITEMS} kayıt</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {attentionPlans.length === 0 ? (
              <EmptyState
                variant="inline"
                icon={ClipboardList}
                title="Bekleyen plan işi yok"
                description="Yeni bir taslak oluşturduğunuzda veya aktif bir planın bitiş tarihi yaklaştığında burada görünür."
              />
            ) : (
              <div className="divide-y divide-border/60">
                {attentionPlans.map((plan) => (
                  <PlanRowLink
                    key={plan.id}
                    plan={plan}
                    clientName={clientNames.get(plan.clientId)!}
                    now={now}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid min-w-0 content-start gap-4">
          <Card className="border-border/70 bg-card/90 shadow-sm shadow-foreground/[0.03]">
            <CardHeader className="pb-3">
              <CardTitle className="text-base tracking-tight">Son güncellenenler</CardTitle>
              <CardDescription>Devam etmek için en son çalıştığınız planlar</CardDescription>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              {recentPlans.length === 0 ? (
                <p className="px-3 py-5 text-sm leading-6 text-muted-foreground">
                  Kuyruk dışındaki güncel bir planınız henüz yok.
                </p>
              ) : (
                <div className="flex flex-col">
                  {recentPlans.map((plan) => (
                    <Link
                      key={plan.id}
                      href={`/danisanlar/${plan.clientId}/planlar/${plan.id}`}
                      className="group flex min-w-0 items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-muted/55"
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/8 text-primary ring-1 ring-primary/10">
                        <ClipboardList className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{plan.name}</span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {clientNames.get(plan.clientId)} · {dateFormatter.format(plan.updatedAt)}
                        </span>
                      </span>
                      <ArrowRight className="size-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-primary/15 bg-primary/[0.045] shadow-sm shadow-primary/5">
            <CardContent className="flex items-center gap-4 p-5">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
                <Layers3 className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">Şablon kütüphanesi</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {templates === null
                    ? 'Klinik şablonlarını görüntüleyin.'
                    : `${templates.length} klinik şablonundan yeni bir danışan planı başlatın.`}
                </p>
              </div>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="shrink-0 rounded-xl bg-background/80"
              >
                <Link href="/planlar/sablonlar">
                  Aç
                  <ArrowRight data-icon="inline-end" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
    </PageFrame>
  )
}

function PageFrame({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-6 pb-8">{children}</div>
}

function PlanPageHeader() {
  return (
    <header className="flex flex-col gap-5 border-b border-border/70 pb-6 lg:flex-row lg:items-end lg:justify-between">
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-primary uppercase">
          <ClipboardList className="size-3.5" />
          Klinik plan operasyonu
        </div>
        <h1 className="text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">Planlar</h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
          Taslakları tamamlayın, süresi yaklaşan programları gözden geçirin ve kaldığınız yerden
          devam edin.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="lg" className="rounded-xl bg-background/80 px-4">
          <Link href="/planlar/sablonlar">
            <Layers3 data-icon="inline-start" />
            Şablonlar
          </Link>
        </Button>
        <Button asChild size="lg" className="rounded-xl px-4 shadow-sm shadow-primary/15">
          <Link href="/danisanlar">
            <UserRoundSearch data-icon="inline-start" />
            Danışan seçerek başla
          </Link>
        </Button>
      </div>
    </header>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon
  label: string
  value: number | string
}) {
  return (
    <Card className="border-border/70 bg-card/85 shadow-sm shadow-foreground/[0.025]">
      <CardContent className="flex min-h-28 flex-col justify-between gap-4 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="max-w-36 text-xs font-medium leading-4 text-muted-foreground">{label}</p>
          <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary/8 text-primary ring-1 ring-primary/10">
            <Icon className="size-4" />
          </span>
        </div>
        <p className="text-2xl font-semibold tracking-[-0.045em] tabular-nums">{value}</p>
      </CardContent>
    </Card>
  )
}

function PlanRowLink({
  plan,
  clientName,
  now,
}: {
  plan: PlanRow & { clientId: string }
  clientName: string
  now: Date
}) {
  const status = planAttentionStatus(plan, now)

  return (
    <Link
      href={`/danisanlar/${plan.clientId}/planlar/${plan.id}`}
      className="group grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-3 px-5 py-4 transition-colors hover:bg-muted/45 sm:flex sm:items-center sm:px-6"
    >
      <span
        className={`grid size-10 shrink-0 place-items-center rounded-xl ring-1 ${status.iconClass}`}
      >
        <status.icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold">{plan.name}</span>
          <Badge variant={plan.status === 'aktif' ? 'default' : 'secondary'}>
            {PLAN_STATUS_LABELS_TR[plan.status]}
          </Badge>
        </span>
        <span className="mt-1 block truncate text-sm text-muted-foreground">{clientName}</span>
      </span>
      <span className="col-span-2 flex shrink-0 items-center justify-between gap-4 sm:col-auto sm:ml-auto sm:justify-end">
        <span className="text-right">
          <span className={`block text-xs font-medium ${status.textClass}`}>{status.label}</span>
          <span className="mt-1 block text-xs text-muted-foreground">
            {plan.targetKcal !== null
              ? `${plan.targetKcal.toLocaleString('tr-TR')} kcal`
              : `Güncellendi ${dateFormatter.format(plan.updatedAt)}`}
          </span>
        </span>
        <ArrowRight className="size-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
      </span>
    </Link>
  )
}

function attentionPriority(plan: PlanRow, now: Date): number {
  if (plan.status === 'aktif' && plan.endDate && plan.endDate < now) return 0
  if (plan.status === 'taslak') return 1
  return 2
}

function planAttentionStatus(
  plan: PlanRow,
  now: Date,
): { icon: LucideIcon; iconClass: string; label: string; textClass: string } {
  if (plan.status === 'taslak') {
    return {
      icon: FileClock,
      iconClass: 'bg-amber-500/10 text-amber-700 ring-amber-500/15 dark:text-amber-300',
      label: 'Taslak tamamlanacak',
      textClass: 'text-amber-700 dark:text-amber-300',
    }
  }

  if (plan.endDate) {
    const daysRemaining = Math.ceil((plan.endDate.getTime() - now.getTime()) / DAY_IN_MS)
    if (daysRemaining < 0) {
      return {
        icon: AlertCircle,
        iconClass: 'bg-destructive/10 text-destructive ring-destructive/15',
        label: 'Bitiş tarihi geçti',
        textClass: 'text-destructive',
      }
    }
    return {
      icon: CalendarClock,
      iconClass: 'bg-primary/10 text-primary ring-primary/15',
      label: daysRemaining === 0 ? 'Bugün bitiyor' : `${daysRemaining} gün kaldı`,
      textClass: 'text-primary',
    }
  }

  return {
    icon: Clock3,
    iconClass: 'bg-muted text-muted-foreground ring-border',
    label: 'Gözden geçirilecek',
    textClass: 'text-muted-foreground',
  }
}

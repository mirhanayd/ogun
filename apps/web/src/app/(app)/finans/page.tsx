import Link from 'next/link'
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  CalendarRange,
  CreditCard,
  Landmark,
  ReceiptText,
  Scale,
  UsersRound,
  WalletCards,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/empty-state'
import {
  monthlyIncomeExpense,
  revenueByDietitian,
  sumPaymentsByClientPackage,
  uncollectedReceivables,
} from '@/lib/billing/finance-aggregation'
import { PAYMENT_METHOD_LABELS_TR } from '@/lib/validation/billing-schemas'
import { ExpenseManager } from './expense-manager'
import { PackageManager } from './package-manager'
import { getBillingPackagesList, getFinanceOverview } from './queries'

const PAYMENT_METHOD_ICONS: Record<keyof typeof PAYMENT_METHOD_LABELS_TR, typeof CreditCard> = {
  nakit: Banknote,
  kart: CreditCard,
  havale: Landmark,
  online: WalletCards,
}

function monthRange(monthParam: string | undefined): {
  from: Date
  to: Date
  label: string
  monthKey: string
} {
  const now = new Date()
  const [yearStr, monthStr] = (monthParam ?? '').split('-')
  const year = Number.isFinite(Number(yearStr)) && yearStr ? Number(yearStr) : now.getFullYear()
  const monthIndex =
    Number.isFinite(Number(monthStr)) && monthStr ? Number(monthStr) - 1 : now.getMonth()

  const from = new Date(year, monthIndex, 1, 0, 0, 0, 0)
  const to = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999)
  const label = from.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
  const monthKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}`
  return { from, to, label, monthKey }
}

function adjacentMonthKey(monthKey: string, delta: number): string {
  const [yearPart, monthPart] = monthKey.split('-')
  const date = new Date(Number(yearPart), Number(monthPart) - 1 + delta, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function formatCurrency(value: number): string {
  return value.toLocaleString('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 0,
  })
}

// Finans sayfası hem navigasyonda hem de veri katmanında owner rolüyle korunur.
// Buradaki görünüm klinik yöneticisinin aylık nakit akışını tek bakışta izlemesi
// için bilinçli olarak operasyonel tutulur; ayrıntılı muhasebe raporu değildir.
export default async function FinansPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const { month } = await searchParams
  const { from, to, label, monthKey } = monthRange(month)

  const [overview, billingPackages] = await Promise.all([
    getFinanceOverview({ from, to }),
    getBillingPackagesList(),
  ])

  const { income, expense, net } = monthlyIncomeExpense(overview.payments, overview.expenses)
  const dietitianRevenue = revenueByDietitian(overview.payments)
  const paidByClientPackage = sumPaymentsByClientPackage(overview.clientPackagePayments)
  const receivables = uncollectedReceivables(overview.clientPackages, paidByClientPackage)
  const paymentMethodTotals = Object.entries(
    overview.payments.reduce<Record<string, number>>((acc, payment) => {
      acc[payment.method] = (acc[payment.method] ?? 0) + Number(payment.amount)
      return acc
    }, {}),
  ).sort(([, first], [, second]) => second - first)
  const activePackageCount = billingPackages.filter((item) => item.isActive).length
  const thisMonthKey = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    timeZone: 'Europe/Istanbul',
  }).format(new Date())

  return (
    <div className="flex flex-col gap-7 pb-8">
      <section className="flex flex-col gap-5 border-b border-border/70 pb-7 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-primary uppercase">
            <Landmark className="size-3.5" />
            Klinik finans operasyonu
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.035em] text-balance sm:text-4xl">
            Finans görünümü
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            Tahsilatları, giderleri ve açık paket bakiyelerini aynı dönem içinde takip edin.
          </p>
        </div>

        <div className="flex w-full items-center rounded-xl border border-border/70 bg-card/80 p-1 shadow-xs xl:w-auto">
          <Button asChild variant="ghost" size="icon-lg" className="shrink-0 rounded-lg">
            <Link
              href={`/finans?month=${adjacentMonthKey(monthKey, -1)}`}
              aria-label="Önceki aya git"
            >
              <ArrowLeft />
            </Link>
          </Button>
          <div className="flex min-w-0 flex-1 items-center justify-center gap-2 px-3 sm:min-w-52">
            <CalendarRange className="size-4 shrink-0 text-primary" />
            <span className="truncate text-sm font-semibold capitalize">{label}</span>
            {monthKey === thisMonthKey && (
              <Badge variant="secondary" className="hidden sm:inline-flex">
                Bu ay
              </Badge>
            )}
          </div>
          <Button asChild variant="ghost" size="icon-lg" className="shrink-0 rounded-lg">
            <Link
              href={`/finans?month=${adjacentMonthKey(monthKey, 1)}`}
              aria-label="Sonraki aya git"
            >
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={ArrowUpRight}
          eyebrow="Tahsil edilen"
          label="Aylık gelir"
          value={formatCurrency(income)}
          detail={`${overview.payments.length} ödeme kaydı`}
          tone="positive"
        />
        <StatCard
          icon={ArrowDownRight}
          eyebrow="Kaydedilen"
          label="Aylık gider"
          value={formatCurrency(expense)}
          detail={`${overview.expenses.length} gider kalemi`}
          tone="negative"
        />
        <StatCard
          icon={Scale}
          eyebrow="Dönem sonucu"
          label="Net nakit akışı"
          value={formatCurrency(net)}
          detail={net >= 0 ? 'Gelirler giderlerin üzerinde' : 'Giderler gelirlerin üzerinde'}
          tone={net >= 0 ? 'brand' : 'negative'}
        />
        <StatCard
          icon={WalletCards}
          eyebrow="Açık bakiye"
          label="Tahsil edilmemiş"
          value={formatCurrency(receivables)}
          detail={`${overview.clientPackages.length} paket hareketi`}
          tone="warning"
        />
      </section>

      <section className="grid min-w-0 gap-4 xl:grid-cols-2">
        <Card className="border-border/70 bg-card/90 shadow-sm shadow-foreground/[0.03]">
          <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-border/60 px-5 pb-4 sm:px-6">
            <div className="space-y-1.5">
              <CardTitle className="text-base tracking-tight">Diyetisyen cirosu</CardTitle>
              <CardDescription>Atanan danışanların bu ayki tahsilat payı</CardDescription>
            </div>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
              <UsersRound className="size-4" />
            </span>
          </CardHeader>
          <CardContent className="px-5 sm:px-6">
            {dietitianRevenue.length === 0 ? (
              <EmptyState
                variant="inline"
                icon={UsersRound}
                title="Bu dönemde tahsilat yok"
                description="Danışan ödemeleri kaydedildiğinde ciro ekip üyesi bazında burada ayrışır."
                className="min-h-52"
              />
            ) : (
              <ol className="divide-y divide-border/60">
                {dietitianRevenue.map((row, index) => {
                  const share = income > 0 ? Math.round((row.total / income) * 100) : 0
                  return (
                    <li key={row.dietitianId} className="py-4 first:pt-0 last:pb-0">
                      <div className="flex items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-xs font-semibold text-muted-foreground ring-1 ring-border/70">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="truncate text-sm font-medium">
                              {row.dietitianName}
                            </span>
                            <span className="shrink-0 text-sm font-semibold tabular-nums">
                              {formatCurrency(row.total)}
                            </span>
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-primary"
                                style={{ width: `${Math.max(share, 2)}%` }}
                              />
                            </div>
                            <span className="w-8 text-right text-[0.7rem] font-medium text-muted-foreground tabular-nums">
                              %{share}
                            </span>
                          </div>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/90 shadow-sm shadow-foreground/[0.03]">
          <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-border/60 px-5 pb-4 sm:px-6">
            <div className="space-y-1.5">
              <CardTitle className="text-base tracking-tight">Tahsilat kanalları</CardTitle>
              <CardDescription>Ödemelerin yönteme göre dağılımı</CardDescription>
            </div>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
              <CreditCard className="size-4" />
            </span>
          </CardHeader>
          <CardContent className="px-5 sm:px-6">
            {paymentMethodTotals.length === 0 ? (
              <EmptyState
                variant="inline"
                icon={CreditCard}
                title="Bu dönemde tahsilat yok"
                description="Nakit, kart veya havale ödemeleri kaydedildikçe kanal dağılımı burada oluşur."
                className="min-h-52"
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {paymentMethodTotals.map(([method, total]) => {
                  const share = income > 0 ? Math.round((total / income) * 100) : 0
                  const methodKey = method as keyof typeof PAYMENT_METHOD_LABELS_TR
                  const MethodIcon = PAYMENT_METHOD_ICONS[methodKey]
                  return (
                    <div
                      key={method}
                      className="flex min-w-0 flex-col rounded-xl border border-border/65 bg-background/55 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                          <MethodIcon className="size-3.5" />
                        </span>
                        <Badge variant="outline" className="tabular-nums">
                          %{share}
                        </Badge>
                      </div>
                      <p className="mt-5 truncate text-xs font-medium text-muted-foreground">
                        {PAYMENT_METHOD_LABELS_TR[methodKey]}
                      </p>
                      <p className="mt-1 text-lg font-semibold tracking-tight tabular-nums">
                        {formatCurrency(total)}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              Finans araçları
            </p>
            <h2 className="mt-1.5 text-lg font-semibold tracking-tight">Paketler ve giderler</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            {activePackageCount} aktif paket · {overview.expenses.length} dönem gideri
          </p>
        </div>
        <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <PackageManager packages={billingPackages} />
          <ExpenseManager expenses={overview.expenses} monthLabel={label} />
        </div>
      </section>
    </div>
  )
}

function StatCard({
  icon: Icon,
  eyebrow,
  label,
  value,
  detail,
  tone,
}: {
  icon: typeof ReceiptText
  eyebrow: string
  label: string
  value: string
  detail: string
  tone: 'positive' | 'negative' | 'warning' | 'brand'
}) {
  const toneClass = {
    positive: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/15 dark:text-emerald-300',
    negative: 'bg-rose-500/10 text-rose-700 ring-rose-500/15 dark:text-rose-300',
    warning: 'bg-amber-500/10 text-amber-700 ring-amber-500/15 dark:text-amber-300',
    brand: 'bg-primary/10 text-primary ring-primary/15',
  }[tone]

  return (
    <Card className="h-full border-border/70 bg-card/85 shadow-sm shadow-foreground/[0.025]">
      <CardContent className="flex h-full flex-col gap-5 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[0.69rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              {eyebrow}
            </p>
            <p className="mt-1.5 text-sm font-medium text-foreground/80">{label}</p>
          </div>
          <span
            className={`flex size-9 shrink-0 items-center justify-center rounded-xl ring-1 ${toneClass}`}
          >
            <Icon className="size-4" />
          </span>
        </div>
        <div className="mt-auto">
          <p className="text-2xl font-semibold tracking-[-0.04em] tabular-nums sm:text-[1.7rem]">
            {value}
          </p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
        </div>
      </CardContent>
    </Card>
  )
}

import { ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, Banknote, CalendarRange, CreditCard, Landmark, Scale, UsersRound, WalletCards, type LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/empty-state'
import { NavigationLink } from '@/components/navigation-link'
import { monthlyIncomeExpense, revenueByDietitian, sumPaymentsByClientPackage, uncollectedReceivables } from '@/lib/billing/finance-aggregation'
import { PAYMENT_METHOD_LABELS_TR, type ExpenseFormValues, type PackageFormValues } from '@/lib/validation/billing-schemas'
import { ExpenseManager, type ExpenseRow } from '@/app/(app)/finans/expense-manager'
import { PackageManager, type BillingPackageRow } from '@/app/(app)/finans/package-manager'

export interface FinancePaymentRow { amount: string; method: keyof typeof PAYMENT_METHOD_LABELS_TR; dietitianId: string | null; dietitianName: string | null; clientPackageId: string | null }
export interface FinanceClientPackageRow { id: string; price: string; status: string }
export interface FinanceClientPackagePaymentRow { clientPackageId: string | null; amount: string }
export interface FinanceScreenData { payments: FinancePaymentRow[]; expenses: ExpenseRow[]; clientPackages: FinanceClientPackageRow[]; clientPackagePayments: FinanceClientPackagePaymentRow[]; billingPackages: BillingPackageRow[] }

const currency = (value: number) => value.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 })
const adjacentMonth = (key: string, delta: number) => { const [year, month] = key.split('-').map(Number); const value = new Date(year!, month! - 1 + delta, 1); return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}` }
const METHOD_ICONS: Record<keyof typeof PAYMENT_METHOD_LABELS_TR, LucideIcon> = { nakit: Banknote, kart: CreditCard, havale: Landmark, online: WalletCards }

export function FinanceScreen({ data, monthKey, monthLabel, onCreateExpense, onDeleteExpense, onCreatePackage, onSetPackageActive }: {
  data: FinanceScreenData
  monthKey: string
  monthLabel: string
  onCreateExpense: (values: ExpenseFormValues) => Promise<{ success: boolean; error?: string }>
  onDeleteExpense: (id: string) => Promise<{ success: boolean; error?: string }>
  onCreatePackage: (values: PackageFormValues) => Promise<{ success: boolean; error?: string }>
  onSetPackageActive: (id: string, active: boolean) => Promise<{ success: boolean; error?: string }>
}) {
  const { income, expense, net } = monthlyIncomeExpense(data.payments as never, data.expenses)
  const dietitianRevenue = revenueByDietitian(data.payments as never)
  const paid = sumPaymentsByClientPackage(data.clientPackagePayments as never)
  const receivables = uncollectedReceivables(data.clientPackages as never, paid)
  const methodTotals = Object.entries(data.payments.reduce<Record<string, number>>((acc, payment) => { acc[payment.method] = (acc[payment.method] ?? 0) + Number(payment.amount); return acc }, {})).sort((a, b) => b[1] - a[1])
  return <div className="flex flex-col gap-7 pb-8" data-finance-screen>
    <section className="flex flex-col gap-5 border-b border-border/70 pb-7 xl:flex-row xl:items-end xl:justify-between"><div className="space-y-2"><div className="flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-primary uppercase"><Landmark className="size-3.5" />Klinik finans operasyonu</div><h1 className="text-3xl font-semibold tracking-[-0.035em] text-balance sm:text-4xl">Finans görünümü</h1><p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">Tahsilatları, giderleri ve açık paket bakiyelerini aynı dönem içinde takip edin.</p></div><div className="flex w-full items-center rounded-xl border border-border/70 bg-card/80 p-1 shadow-xs xl:w-auto"><Button asChild variant="ghost" size="icon-lg"><NavigationLink href={`/finans?month=${adjacentMonth(monthKey, -1)}`} aria-label="Önceki aya git"><ArrowLeft /></NavigationLink></Button><div className="flex min-w-52 flex-1 items-center justify-center gap-2 px-3"><CalendarRange className="size-4 text-primary" /><span className="truncate text-sm font-semibold capitalize">{monthLabel}</span></div><Button asChild variant="ghost" size="icon-lg"><NavigationLink href={`/finans?month=${adjacentMonth(monthKey, 1)}`} aria-label="Sonraki aya git"><ArrowRight /></NavigationLink></Button></div></section>
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"><Stat icon={ArrowUpRight} eyebrow="Tahsil edilen" label="Aylık gelir" value={currency(income)} detail={`${data.payments.length} ödeme kaydı`} tone="positive" /><Stat icon={ArrowDownRight} eyebrow="Kaydedilen" label="Aylık gider" value={currency(expense)} detail={`${data.expenses.length} gider kalemi`} tone="negative" /><Stat icon={Scale} eyebrow="Dönem sonucu" label="Net nakit akışı" value={currency(net)} detail={net >= 0 ? 'Gelirler giderlerin üzerinde' : 'Giderler gelirlerin üzerinde'} tone={net >= 0 ? 'brand' : 'negative'} /><Stat icon={WalletCards} eyebrow="Açık bakiye" label="Tahsil edilmemiş" value={currency(receivables)} detail={`${data.clientPackages.length} paket hareketi`} tone="warning" /></section>
    <section className="grid min-w-0 gap-4 xl:grid-cols-2"><Card><CardHeader className="border-b"><CardTitle className="text-base">Diyetisyen cirosu</CardTitle><CardDescription>Atanan danışanların bu ayki tahsilat payı</CardDescription></CardHeader><CardContent>{dietitianRevenue.length === 0 ? <EmptyState variant="inline" icon={UsersRound} title="Bu dönemde tahsilat yok" description="Danışan ödemeleri kaydedildiğinde ciro ekip üyesi bazında burada ayrışır." /> : <ol className="divide-y">{dietitianRevenue.map((row) => <li key={row.dietitianId} className="flex justify-between py-4"><span>{row.dietitianName}</span><strong>{currency(row.total)}</strong></li>)}</ol>}</CardContent></Card><Card><CardHeader className="border-b"><CardTitle className="text-base">Tahsilat kanalları</CardTitle><CardDescription>Ödemelerin yönteme göre dağılımı</CardDescription></CardHeader><CardContent>{methodTotals.length === 0 ? <EmptyState variant="inline" icon={CreditCard} title="Bu dönemde tahsilat yok" description="Ödemeler kaydedildikçe kanal dağılımı burada oluşur." /> : <div className="grid gap-3 sm:grid-cols-2">{methodTotals.map(([method, total]) => { const key = method as keyof typeof PAYMENT_METHOD_LABELS_TR; const Icon = METHOD_ICONS[key]; return <div key={method} className="rounded-xl border p-4"><div className="flex justify-between"><Icon className="size-4" /><Badge variant="outline">%{income > 0 ? Math.round(total / income * 100) : 0}</Badge></div><p className="mt-4 text-xs text-muted-foreground">{PAYMENT_METHOD_LABELS_TR[key]}</p><p className="text-lg font-semibold">{currency(total)}</p></div> })}</div>}</CardContent></Card></section>
    <section className="space-y-4"><div><p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">Finans araçları</p><h2 className="mt-1.5 text-lg font-semibold">Paketler ve giderler</h2></div><div className="grid items-start gap-4 xl:grid-cols-2"><PackageManager packages={data.billingPackages} onCreate={onCreatePackage} onSetActive={onSetPackageActive} /><ExpenseManager expenses={data.expenses} monthLabel={monthLabel} onCreate={onCreateExpense} onDelete={onDeleteExpense} /></div></section>
  </div>
}

function Stat({ icon: Icon, eyebrow, label, value, detail, tone }: { icon: LucideIcon; eyebrow: string; label: string; value: string; detail: string; tone: 'positive' | 'negative' | 'warning' | 'brand' }) {
  const color = { positive: 'text-emerald-700', negative: 'text-rose-700', warning: 'text-amber-700', brand: 'text-primary' }[tone]
  return <Card><CardContent className="flex h-full flex-col gap-5 p-5"><div className="flex justify-between"><div><p className="text-[0.69rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{eyebrow}</p><p className="mt-1.5 text-sm">{label}</p></div><Icon className={`size-5 ${color}`} /></div><div><p className="text-2xl font-semibold tabular-nums">{value}</p><p className="text-xs text-muted-foreground">{detail}</p></div></CardContent></Card>
}

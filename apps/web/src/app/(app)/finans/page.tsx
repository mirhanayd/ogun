import Link from 'next/link'
import { TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  monthlyIncomeExpense,
  revenueByDietitian,
  sumPaymentsByClientPackage,
  uncollectedReceivables,
} from '@/lib/billing/finance-aggregation'
import { PAYMENT_METHOD_LABELS_TR } from '@/lib/validation/billing-schemas'
import { getBillingPackagesList, getFinanceOverview } from './queries'
import { ExpenseManager } from './expense-manager'
import { PackageManager } from './package-manager'

function monthRange(monthParam: string | undefined): { from: Date; to: Date; label: string; monthKey: string } {
  const now = new Date()
  const [yearStr, monthStr] = (monthParam ?? '').split('-')
  const year = Number.isFinite(Number(yearStr)) && yearStr ? Number(yearStr) : now.getFullYear()
  const monthIndex = Number.isFinite(Number(monthStr)) && monthStr ? Number(monthStr) - 1 : now.getMonth()

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
  return value.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 })
}

// /finans — GitHub issue #40 / Prompt 7.2, GÖREV 3. Sadece owner rolü
// erişebilir (bkz. nav-items.ts requiredRole + queries.ts requireRole('owner')
// çifte kısıtı). "Basit tut, detaylı raporlama v2" kuralı gereği tek sayfa:
// aylık gelir/gider, diyetisyen bazlı ciro, tahsil edilmemiş alacaklar,
// paket tanımları ve basit gider takibi.
export default async function FinansPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const { month } = await searchParams
  const { from, to, label, monthKey } = monthRange(month)

  const [overview, billingPackages] = await Promise.all([getFinanceOverview({ from, to }), getBillingPackagesList()])

  const { income, expense, net } = monthlyIncomeExpense(overview.payments, overview.expenses)
  const dietitianRevenue = revenueByDietitian(overview.payments)
  const paidByClientPackage = sumPaymentsByClientPackage(overview.clientPackagePayments)
  const receivables = uncollectedReceivables(overview.clientPackages, paidByClientPackage)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Finans</h1>
          <p className="text-sm text-muted-foreground">Aylık gelir/gider özeti — detaylı raporlama v2 kapsamında.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/finans?month=${adjacentMonthKey(monthKey, -1)}`}>‹ Önceki ay</Link>
          </Button>
          <Badge variant="secondary" className="capitalize">
            {label}
          </Badge>
          <Button asChild variant="outline" size="sm">
            <Link href={`/finans?month=${adjacentMonthKey(monthKey, 1)}`}>Sonraki ay ›</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={TrendingUp} label="Gelir" value={formatCurrency(income)} tone="positive" />
        <StatCard icon={TrendingDown} label="Gider" value={formatCurrency(expense)} tone="negative" />
        <StatCard icon={Wallet} label="Net" value={formatCurrency(net)} tone={net >= 0 ? 'positive' : 'negative'} />
        <StatCard icon={Wallet} label="Tahsil edilmemiş alacak" value={formatCurrency(receivables)} tone="neutral" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Diyetisyen bazlı ciro</CardTitle>
            <CardDescription>Danışanın atanan diyetisyenine göre bu ayki ödeme toplamı.</CardDescription>
          </CardHeader>
          <CardContent>
            {dietitianRevenue.length === 0 ? (
              <p className="text-sm text-muted-foreground">Bu ay henüz ödeme kaydı yok.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {dietitianRevenue.map((row) => (
                  <div key={row.dietitianId} className="flex items-center justify-between text-sm">
                    <span>{row.dietitianName}</span>
                    <span className="font-medium">{formatCurrency(row.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ödeme yöntemi dağılımı</CardTitle>
            <CardDescription>Bu ayki ödemelerin yönteme göre toplamı.</CardDescription>
          </CardHeader>
          <CardContent>
            {overview.payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Bu ay henüz ödeme kaydı yok.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {Object.entries(
                  overview.payments.reduce<Record<string, number>>((acc, payment) => {
                    acc[payment.method] = (acc[payment.method] ?? 0) + Number(payment.amount)
                    return acc
                  }, {}),
                ).map(([method, total]) => (
                  <div key={method} className="flex items-center justify-between text-sm">
                    <span>{PAYMENT_METHOD_LABELS_TR[method as keyof typeof PAYMENT_METHOD_LABELS_TR]}</span>
                    <span className="font-medium">{formatCurrency(total)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <PackageManager packages={billingPackages} />
      <ExpenseManager expenses={overview.expenses} monthLabel={label} />
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof TrendingUp
  label: string
  value: string
  tone: 'positive' | 'negative' | 'neutral'
}) {
  const toneClass =
    tone === 'positive'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'negative'
        ? 'text-rose-600 dark:text-rose-400'
        : 'text-foreground'
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4">
        <Icon className={`size-5 ${toneClass}`} />
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className={`text-lg font-semibold ${toneClass}`}>{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}

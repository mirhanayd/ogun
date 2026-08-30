import { FinanceScreen } from '@/screens/finance-screen'
import { getBillingPackagesList, getFinanceOverview } from './queries'
import { createExpenseAction, createPackageAction, deleteExpenseAction, setPackageActiveAction } from './actions'

function monthRange(monthParam?: string) {
  const now = new Date(); const [yearValue, monthValue] = (monthParam ?? '').split('-').map(Number)
  const year = Number.isFinite(yearValue) && yearValue ? yearValue : now.getFullYear(); const month = Number.isFinite(monthValue) && monthValue ? monthValue - 1 : now.getMonth()
  const from = new Date(year, month, 1); const to = new Date(year, month + 1, 0, 23, 59, 59, 999)
  return { from, to, monthKey: `${year}-${String(month + 1).padStart(2, '0')}`, label: from.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }) }
}

export default async function FinansPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month } = await searchParams; const range = monthRange(month)
  const [overview, billingPackages] = await Promise.all([getFinanceOverview({ from: range.from, to: range.to }), getBillingPackagesList()])
  return <FinanceScreen data={{ ...overview, billingPackages }} monthKey={range.monthKey} monthLabel={range.label} onCreateExpense={createExpenseAction} onDeleteExpense={deleteExpenseAction} onCreatePackage={createPackageAction} onSetPackageActive={setPackageActiveAction} />
}

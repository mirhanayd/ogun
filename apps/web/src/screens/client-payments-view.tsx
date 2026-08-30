import { Wallet } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/empty-state'
import { calculateClientBalance } from '@/lib/billing/client-account'
import { isLowSessionWarning, remainingSessions, resolveDisplayStatus } from '@/lib/billing/client-package'
import { CLIENT_PACKAGE_STATUS_LABELS_TR, PAYMENT_METHOD_LABELS_TR, type PaymentFormValues, type PurchasePackageFormValues } from '@/lib/validation/billing-schemas'
import { PaymentDialog } from '@/app/(app)/danisanlar/[id]/odemeler/payment-dialog'
import { PurchasePackageDialog } from '@/app/(app)/danisanlar/[id]/odemeler/purchase-package-dialog'

export interface ClientPackageViewRow { id: string; packageId: string; packageName: string; sessionCount: number; purchasedAt: Date; price: string; sessionsUsed: number; expiresAt: Date | null; status: 'aktif' | 'tamamlandı' | 'iptal' | 'süresi_doldu' }
export interface PaymentViewRow { id: string; amount: string; method: 'nakit' | 'kart' | 'havale' | 'online'; paidAt: Date; notes: string | null; receiptSeries: string | null; receiptSequenceNumber: string | null; clientPackageId: string | null }
export interface AvailablePackageViewRow { id: string; name: string; sessionCount: number; price: string }

const currency = (value: number) => value.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 })

export function OdemelerView({ clientPackages, payments, availablePackages, onCreatePayment, onPurchasePackage }: {
  clientPackages: ClientPackageViewRow[]
  payments: PaymentViewRow[]
  availablePackages: AvailablePackageViewRow[]
  onCreatePayment: (values: PaymentFormValues) => Promise<{ success: boolean; error?: string }>
  onPurchasePackage: (values: PurchasePackageFormValues) => Promise<{ success: boolean; error?: string }>
}) {
  const { totalOwed, totalPaid, balance } = calculateClientBalance(clientPackages as never, payments as never)
  return <div className="flex flex-col gap-4">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><SummaryCard label="Toplam paket tutarı" value={currency(totalOwed)} /><SummaryCard label="Toplam ödenen" value={currency(totalPaid)} /><SummaryCard label={balance > 0 ? 'Borç' : 'Bakiye'} value={currency(Math.abs(balance))} tone={balance > 0 ? 'negative' : 'positive'} /></div>
    <Card><CardHeader className="flex flex-row items-center justify-between gap-3"><CardTitle className="text-base">Paket geçmişi</CardTitle><PurchasePackageDialog packages={availablePackages} onSave={onPurchasePackage} /></CardHeader><CardContent>
      {clientPackages.length === 0 ? <EmptyState icon={Wallet} title="Henüz paket satın alınmadı" description="Danışana bir seans paketi satmak için yukarıdaki düğmeyi kullanın." /> : <div className="flex flex-col gap-2">{clientPackages.map((pkg) => { const displayStatus = resolveDisplayStatus(pkg as never); const remaining = remainingSessions(pkg as never); const lowWarning = isLowSessionWarning(pkg as never); return <div key={pkg.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm"><div><p className="font-medium">{pkg.packageName}</p><p className="text-xs text-muted-foreground">{pkg.purchasedAt.toLocaleDateString('tr-TR')} · {Number(pkg.price).toLocaleString('tr-TR')} ₺ · {pkg.sessionsUsed}/{pkg.sessionCount} seans kullanıldı{pkg.expiresAt ? ` · ${pkg.expiresAt.toLocaleDateString('tr-TR')} tarihine kadar geçerli` : ''}</p></div><div className="flex items-center gap-2">{lowWarning ? <Badge variant="destructive">Son {remaining} seans</Badge> : null}<Badge variant={displayStatus === 'aktif' ? 'secondary' : 'outline'}>{CLIENT_PACKAGE_STATUS_LABELS_TR[displayStatus]}</Badge></div></div> })}</div>}
    </CardContent></Card>
    <Card><CardHeader className="flex flex-row items-center justify-between gap-3"><CardTitle className="text-base">Ödemeler</CardTitle><PaymentDialog clientPackages={clientPackages.filter((pkg) => pkg.status === 'aktif').map((pkg) => ({ id: pkg.id, packageName: pkg.packageName }))} onSave={onCreatePayment} /></CardHeader><CardContent>
      {payments.length === 0 ? <EmptyState icon={Wallet} title="Henüz ödeme kaydı yok" description="İlk ödemeyi kaydetmek için yukarıdaki düğmeyi kullanın." /> : <div className="flex flex-col gap-2">{payments.map((payment) => <div key={payment.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm"><div><p className="font-medium">{Number(payment.amount).toLocaleString('tr-TR')} ₺</p><p className="text-xs text-muted-foreground">{payment.paidAt.toLocaleDateString('tr-TR')} · {PAYMENT_METHOD_LABELS_TR[payment.method]}{payment.receiptSeries || payment.receiptSequenceNumber ? ` · Makbuz ${payment.receiptSeries ?? ''}${payment.receiptSequenceNumber ? ` ${payment.receiptSequenceNumber}` : ''}` : ''}</p>{payment.notes ? <p className="mt-1 text-xs text-muted-foreground">{payment.notes}</p> : null}</div></div>)}</div>}
    </CardContent></Card>
  </div>
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone?: 'positive' | 'negative' }) {
  const toneClass = tone === 'positive' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'negative' ? 'text-rose-600 dark:text-rose-400' : 'text-foreground'
  return <Card><CardContent className="py-4"><p className="text-xs text-muted-foreground">{label}</p><p className={`text-lg font-semibold ${toneClass}`}>{value}</p></CardContent></Card>
}

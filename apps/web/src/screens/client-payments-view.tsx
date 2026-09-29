import { CircleAlert, PackageCheck, ReceiptText, Wallet } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/empty-state'
import {
  ClientMetricStrip,
  ClientWorkspaceHeader,
  ClientWorkspaceSection,
} from '@/screens/client-workspace'
import { calculateClientBalance } from '@/lib/billing/client-account'
import {
  isLowSessionWarning,
  remainingSessions,
  resolveDisplayStatus,
} from '@/lib/billing/client-package'
import {
  CLIENT_PACKAGE_STATUS_LABELS_TR,
  PAYMENT_METHOD_LABELS_TR,
  type PaymentFormValues,
  type PurchasePackageFormValues,
} from '@/lib/validation/billing-schemas'
import { PaymentDialog } from '@/app/(app)/danisanlar/[id]/odemeler/payment-dialog'
import { PurchasePackageDialog } from '@/app/(app)/danisanlar/[id]/odemeler/purchase-package-dialog'

export interface ClientPackageViewRow {
  id: string
  packageId: string
  packageName: string
  sessionCount: number
  purchasedAt: Date
  price: string
  sessionsUsed: number
  expiresAt: Date | null
  status: 'aktif' | 'tamamlandı' | 'iptal' | 'süresi_doldu'
}

export interface PaymentViewRow {
  id: string
  amount: string
  method: 'nakit' | 'kart' | 'havale' | 'online'
  paidAt: Date
  notes: string | null
  receiptSeries: string | null
  receiptSequenceNumber: string | null
  clientPackageId: string | null
}

export interface AvailablePackageViewRow {
  id: string
  name: string
  sessionCount: number
  price: string
}

const currency = (value: number) =>
  value.toLocaleString('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 0,
  })

export function OdemelerView({
  clientPackages,
  payments,
  availablePackages,
  onCreatePayment,
  onPurchasePackage,
}: {
  clientPackages: ClientPackageViewRow[]
  payments: PaymentViewRow[]
  availablePackages: AvailablePackageViewRow[]
  onCreatePayment: (values: PaymentFormValues) => Promise<{ success: boolean; error?: string }>
  onPurchasePackage: (
    values: PurchasePackageFormValues,
  ) => Promise<{ success: boolean; error?: string }>
}) {
  const { totalOwed, totalPaid, balance } = calculateClientBalance(
    clientPackages as never,
    payments as never,
  )
  const activePackages = clientPackages.filter((pkg) => pkg.status === 'aktif')

  return (
    <div className="flex flex-col gap-6">
      <ClientWorkspaceHeader
        icon={Wallet}
        title="Paket ve ödemeler"
        description="Danışanın seans paketlerini, kalan haklarını ve ödeme hareketlerini birlikte izleyin."
        meta={`${activePackages.length} aktif paket`}
      />
      <ClientMetricStrip
        items={[
          { label: 'Paket tutarı', value: currency(totalOwed), detail: 'Toplam satış' },
          { label: 'Ödenen', value: currency(totalPaid), detail: `${payments.length} ödeme` },
          {
            label: balance > 0 ? 'Kalan borç' : 'Bakiye',
            value: currency(Math.abs(balance)),
            detail: balance > 0 ? 'Tahsilat bekliyor' : 'Borç bulunmuyor',
            tone: balance > 0 ? 'alert' : 'default',
          },
        ]}
      />
      <ClientWorkspaceSection
        title="Paket geçmişi"
        description="Satın alınan paketler ve kalan seans durumları."
        actions={<PurchasePackageDialog packages={availablePackages} onSave={onPurchasePackage} />}
      >
        {clientPackages.length === 0 ? (
          <EmptyState
            icon={PackageCheck}
            title="Henüz paket satın alınmadı"
            description="Danışana ilk seans paketini eklemek için paket satışı işlemini kullanın."
          />
        ) : (
          <div className="divide-y divide-border border-y border-border">
            {clientPackages.map((pkg) => {
              const displayStatus = resolveDisplayStatus(pkg as never)
              const remaining = remainingSessions(pkg as never)
              const lowWarning = isLowSessionWarning(pkg as never)
              return (
                <div
                  key={pkg.id}
                  className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">{pkg.packageName}</p>
                      <Badge variant={displayStatus === 'aktif' ? 'secondary' : 'outline'}>
                        {CLIENT_PACKAGE_STATUS_LABELS_TR[displayStatus]}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {pkg.purchasedAt.toLocaleDateString('tr-TR')} ·{' '}
                      {Number(pkg.price).toLocaleString('tr-TR')} ₺
                      {pkg.expiresAt
                        ? ` · ${pkg.expiresAt.toLocaleDateString('tr-TR')} tarihine kadar`
                        : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 sm:justify-end">
                    {lowWarning ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-destructive">
                        <CircleAlert className="size-3.5" aria-hidden="true" />
                        Son {remaining} seans
                      </span>
                    ) : null}
                    <span className="text-sm font-semibold tabular-nums">
                      {pkg.sessionsUsed}/{pkg.sessionCount} seans
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </ClientWorkspaceSection>
      <ClientWorkspaceSection
        title="Ödeme hareketleri"
        description="Tahsilatlar, yöntemleri ve makbuz bilgileri."
        actions={
          <PaymentDialog
            clientPackages={activePackages.map((pkg) => ({
              id: pkg.id,
              packageName: pkg.packageName,
            }))}
            onSave={onCreatePayment}
          />
        }
      >
        {payments.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title="Henüz ödeme kaydı yok"
            description="İlk tahsilatı kaydetmek için ödeme ekleyin."
          />
        ) : (
          <div className="divide-y divide-border border-y border-border">
            {payments.map((payment) => (
              <div
                key={payment.id}
                className="grid gap-2 py-4 sm:grid-cols-[8rem_minmax(0,1fr)_auto] sm:items-start"
              >
                <p className="text-xs tabular-nums text-muted-foreground">
                  {payment.paidAt.toLocaleDateString('tr-TR')}
                </p>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{PAYMENT_METHOD_LABELS_TR[payment.method]}</p>
                  {payment.receiptSeries || payment.receiptSequenceNumber ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Makbuz {payment.receiptSeries ?? ''}
                      {payment.receiptSequenceNumber ? ` ${payment.receiptSequenceNumber}` : ''}
                    </p>
                  ) : null}
                  {payment.notes ? (
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{payment.notes}</p>
                  ) : null}
                </div>
                <p className="text-sm font-semibold tabular-nums">
                  {Number(payment.amount).toLocaleString('tr-TR')} ₺
                </p>
              </div>
            ))}
          </div>
        )}
      </ClientWorkspaceSection>
    </div>
  )
}

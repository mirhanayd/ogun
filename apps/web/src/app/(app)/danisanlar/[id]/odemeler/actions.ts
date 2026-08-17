'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@ogun/db'
import { createPayment, purchaseClientPackage, updateClientPackageStatus } from '@ogun/db/queries'
import { withAuth } from '@/lib/authz'
import { withAudit } from '@/lib/audit'
import { getInvoiceProvider } from '@/lib/invoicing'
import {
  paymentFormSchema,
  purchasePackageFormSchema,
  type PaymentFormValues,
  type PurchasePackageFormValues,
} from '@/lib/validation/billing-schemas'

// GitHub issue #40 / Prompt 7.2, GÖREV 2 — danışan cari hesabı mutasyonları.
// randevular/actions.ts ile AYNI dönüş deseni.
export interface BillingActionResult {
  success: boolean
  error?: string
  clientPackageId?: string
  paymentId?: string
}

function firstZodMessage(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? 'Geçersiz veri gönderildi.'
}

// --- Paket satışı -------------------------------------------------------

const purchaseClientPackageForClinic = withAuth(
  withAudit(
    {
      action: 'create',
      entityType: 'client_package',
      entityId: (_args: unknown[], result: { id: string } | undefined) => result?.id ?? null,
    },
    async (ctx, input: { clientId: string; packageId: string; price: string }) =>
      purchaseClientPackage(db, ctx.scope.clinicId, input),
  ),
)

export async function purchasePackageAction(
  clientId: string,
  input: PurchasePackageFormValues,
): Promise<BillingActionResult> {
  const parsed = purchasePackageFormSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: firstZodMessage(parsed.error) }
  }
  try {
    const created = await purchaseClientPackageForClinic({
      clientId,
      packageId: parsed.data.packageId,
      price: parsed.data.price,
    })
    revalidatePath(`/danisanlar/${clientId}`)
    revalidatePath('/finans')
    return { success: true, clientPackageId: created?.id }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Paket satın alma kaydedilemedi.' }
  }
}

const cancelClientPackageForClinic = withAuth(
  withAudit(
    { action: 'update', entityType: 'client_package', entityId: ([id]: [string]) => id },
    async (ctx, clientPackageId: string) =>
      updateClientPackageStatus(db, ctx.scope.clinicId, clientPackageId, 'iptal'),
  ),
)

export async function cancelClientPackageAction(clientPackageId: string, clientId: string): Promise<BillingActionResult> {
  try {
    await cancelClientPackageForClinic(clientPackageId)
    revalidatePath(`/danisanlar/${clientId}`)
    revalidatePath('/finans')
    return { success: true, clientPackageId }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Paket iptal edilemedi.' }
  }
}

// --- Ödeme kaydı ----------------------------------------------------------

const createPaymentForClinic = withAuth(
  withAudit(
    {
      action: 'create',
      entityType: 'payment',
      entityId: (_args: unknown[], result: { id: string } | undefined) => result?.id ?? null,
    },
    async (
      ctx,
      input: {
        clientId: string
        clientPackageId: string | null
        amount: string
        method: PaymentFormValues['method']
        paidAt: Date
        notes: string | null
        receiptSeries: string | null
        receiptSequenceNumber: string | null
        receiptIssuedAt: string | null
      },
    ) => createPayment(db, ctx.scope.clinicId, input),
  ),
)

export async function createPaymentAction(clientId: string, input: PaymentFormValues): Promise<BillingActionResult> {
  const parsed = paymentFormSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: firstZodMessage(parsed.error) }
  }

  const paidAt = new Date(`${parsed.data.paidAt}T00:00:00`)

  // e-SMM hazırlığı (GÖREV 4) — diyetisyen seri/sıra no girdiyse "manuel"
  // sağlayıcı üzerinden (bkz. lib/invoicing/) makbuz kesim tarihi damgalanır.
  // Hiçbiri girilmediyse makbuz alanları NULL kalır — ödeme kaydı makbuzsuz
  // da tamamlanabilir (bkz. billing-schemas.ts notu).
  let receiptSeries: string | null = null
  let receiptSequenceNumber: string | null = null
  let receiptIssuedAt: string | null = null
  if (parsed.data.receiptSeries || parsed.data.receiptSequenceNumber) {
    const issued = await getInvoiceProvider().issueReceipt({
      paymentId: 'pending',
      clientName: '',
      amount: parsed.data.amount,
      paidAt,
      series: parsed.data.receiptSeries || null,
      sequenceNumber: parsed.data.receiptSequenceNumber || null,
    })
    receiptSeries = issued.series
    receiptSequenceNumber = issued.sequenceNumber
    receiptIssuedAt = issued.issuedAt
  }

  try {
    const created = await createPaymentForClinic({
      clientId,
      clientPackageId: parsed.data.clientPackageId || null,
      amount: parsed.data.amount,
      method: parsed.data.method,
      paidAt,
      notes: parsed.data.notes || null,
      receiptSeries,
      receiptSequenceNumber,
      receiptIssuedAt,
    })
    revalidatePath(`/danisanlar/${clientId}`)
    revalidatePath('/finans')
    return { success: true, paymentId: created?.id }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Ödeme kaydedilemedi.' }
  }
}

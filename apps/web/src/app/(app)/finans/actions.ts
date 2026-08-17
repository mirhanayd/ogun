'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@ogun/db'
import { createBillingPackage, createExpense, deleteExpense, updateBillingPackage } from '@ogun/db/queries'
import { withAuth } from '@/lib/authz'
import { withAudit } from '@/lib/audit'
import { expenseFormSchema, packageFormSchema, type ExpenseFormValues, type PackageFormValues } from '@/lib/validation/billing-schemas'

// GitHub issue #40 / Prompt 7.2 — /finans mutasyonları. randevular/actions.ts
// ile AYNI dönüş deseni (fırlatmak yerine bir sonuç nesnesi) VE AYNI
// owner-only kısıtı (bkz. queries.ts üstündeki not).
export interface FinanceActionResult {
  success: boolean
  error?: string
  packageId?: string
  expenseId?: string
}

function firstZodMessage(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? 'Geçersiz veri gönderildi.'
}

// --- Paket TANIMLARI ---------------------------------------------------------

const createBillingPackageForClinic = withAuth(
  withAudit(
    {
      action: 'create',
      entityType: 'billing_package',
      entityId: (_args: unknown[], result: { id: string } | undefined) => result?.id ?? null,
    },
    async (ctx, input: { name: string; sessionCount: number; price: string; validityDays: number | null }) =>
      createBillingPackage(db, ctx.scope.clinicId, input),
  ),
  ['owner'],
)

export async function createPackageAction(input: PackageFormValues): Promise<FinanceActionResult> {
  const parsed = packageFormSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: firstZodMessage(parsed.error) }
  }
  try {
    const created = await createBillingPackageForClinic({
      name: parsed.data.name,
      sessionCount: parsed.data.sessionCount,
      price: parsed.data.price,
      validityDays: parsed.data.validityDays ? Number(parsed.data.validityDays) : null,
    })
    revalidatePath('/finans')
    return { success: true, packageId: created?.id }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Paket oluşturulamadı.' }
  }
}

const setBillingPackageActiveForClinic = withAuth(
  withAudit(
    {
      action: 'update',
      entityType: 'billing_package',
      entityId: ([packageId]: [string, boolean]) => packageId,
    },
    async (ctx, packageId: string, isActive: boolean) =>
      updateBillingPackage(db, ctx.scope.clinicId, packageId, { isActive }),
  ),
  ['owner'],
)

export async function setPackageActiveAction(packageId: string, isActive: boolean): Promise<FinanceActionResult> {
  try {
    await setBillingPackageActiveForClinic(packageId, isActive)
    revalidatePath('/finans')
    return { success: true, packageId }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Paket güncellenemedi.' }
  }
}

// --- Basit gider takibi ------------------------------------------------------

const createExpenseForClinic = withAuth(
  withAudit(
    {
      action: 'create',
      entityType: 'expense',
      entityId: (_args: unknown[], result: { id: string } | undefined) => result?.id ?? null,
    },
    async (ctx, input: { category: string; amount: string; date: string; description: string | null }) =>
      createExpense(db, ctx.scope.clinicId, input),
  ),
  ['owner'],
)

export async function createExpenseAction(input: ExpenseFormValues): Promise<FinanceActionResult> {
  const parsed = expenseFormSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: firstZodMessage(parsed.error) }
  }
  try {
    const created = await createExpenseForClinic({
      category: parsed.data.category,
      amount: parsed.data.amount,
      date: parsed.data.date,
      description: parsed.data.description || null,
    })
    revalidatePath('/finans')
    return { success: true, expenseId: created?.id }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Gider kaydedilemedi.' }
  }
}

const deleteExpenseForClinic = withAuth(
  withAudit(
    { action: 'delete', entityType: 'expense', entityId: ([id]: [string]) => id },
    async (ctx, expenseId: string) => deleteExpense(db, ctx.scope.clinicId, expenseId),
  ),
  ['owner'],
)

export async function deleteExpenseAction(expenseId: string): Promise<FinanceActionResult> {
  try {
    await deleteExpenseForClinic(expenseId)
    revalidatePath('/finans')
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Gider silinemedi.' }
  }
}

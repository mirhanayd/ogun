'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@ogun/db'
import { createLabResult, deleteLabResult } from '@ogun/db/queries'
import { assertLabResultAccess, withAuth, withClientAuth } from '@/lib/authz'
import { withAudit } from '@/lib/audit'
import { labResultFormSchema, type LabResultFormValues } from '@/lib/validation/lab-schemas'
import type { ClientActionResult } from '../../actions'

// GitHub issue #19 / Prompt 4.3, GÖREV 2 — laboratuvar sonucu mutasyonları.
// measurements/actions.ts ile AYNI "fırlatmak yerine sonuç nesnesi döndür"
// deseni.

function toNullableNumber(value: string | undefined): number | null {
  return value === undefined || value === '' ? null : Number(value)
}

const createLabResultForClinic = withClientAuth(
  withAudit(
    {
      action: 'create',
      entityType: 'lab_result',
      entityId: (_args: [string, LabResultFormValues], result: { id: string } | undefined) => result?.id ?? null,
    },
    async (ctx, clientId: string, input: LabResultFormValues) =>
      createLabResult(db, ctx.scope.clinicId, clientId, {
        testedAt: new Date(input.testedAt),
        analyte: input.analyte,
        value: Number(input.value),
        unit: input.unit,
        refMin: toNullableNumber(input.refMin),
        refMax: toNullableNumber(input.refMax),
        labName: input.labName || null,
        notes: input.notes || null,
        recordedBy: ctx.user.id,
      }),
  ),
)

function firstZodMessage(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? 'Geçersiz veri gönderildi.'
}

export async function createLabResultAction(
  clientId: string,
  input: LabResultFormValues,
): Promise<ClientActionResult> {
  const parsed = labResultFormSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: firstZodMessage(parsed.error) }
  }

  try {
    await createLabResultForClinic(clientId, parsed.data)
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Laboratuvar sonucu kaydedilemedi.' }
  }
  revalidatePath(`/danisanlar/${clientId}`)
  return { success: true }
}

const deleteLabResultForClinic = withAuth(
  withAudit(
    { action: 'delete', entityType: 'lab_result', entityId: ([labResultId]: [string]) => labResultId },
    async (ctx, labResultId: string) => {
      await assertLabResultAccess(ctx, labResultId)
      return deleteLabResult(db, ctx.scope.clinicId, labResultId)
    },
  ),
)

export async function deleteLabResultAction(labResultId: string, clientId: string): Promise<ClientActionResult> {
  try {
    await deleteLabResultForClinic(labResultId)
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Silinemedi.' }
  }
  revalidatePath(`/danisanlar/${clientId}`)
  return { success: true }
}

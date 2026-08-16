'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@ogun/db'
import { createGoal, createMeasurement, markGoalAchieved } from '@ogun/db/queries'
import { withAuth } from '@/lib/authz'
import { withAudit } from '@/lib/audit'
import {
  goalFormSchema,
  measurementFormSchema,
  type GoalFormValues,
  type MeasurementFormValues,
} from '@/lib/validation/measurement-schemas'
import type { ClientActionResult } from '../../actions'

// GitHub issue #18 / Prompt 4.2 — ölçüm/hedef mutasyonları. Dönüş tipi
// danisanlar/actions.ts'teki ClientActionResult'la AYNI ("fırlatmak yerine
// sonuç nesnesi döndür" deseni, bkz. o dosyanın üstündeki not).

function toNullableNumber(value: string | undefined): number | null {
  return value === undefined || value === '' ? null : Number(value)
}

// --- Ölçüm ekleme (GÖREV 2) -------------------------------------------------

const createMeasurementForClinic = withAuth(
  withAudit(
    {
      action: 'create',
      entityType: 'measurement',
      entityId: (_args: [string, MeasurementFormValues], result: { id: string } | undefined) =>
        result?.id ?? null,
    },
    async (ctx, clientId: string, input: MeasurementFormValues) =>
      createMeasurement(db, ctx.scope.clinicId, clientId, {
        measuredAt: new Date(input.measuredAt),
        source: input.source,
        weightKg: toNullableNumber(input.weightKg),
        heightCm: toNullableNumber(input.heightCm),
        waistCm: toNullableNumber(input.waistCm),
        hipCm: toNullableNumber(input.hipCm),
        neckCm: toNullableNumber(input.neckCm),
        armCm: toNullableNumber(input.armCm),
        thighCm: toNullableNumber(input.thighCm),
        chestCm: toNullableNumber(input.chestCm),
        bodyFatPct: toNullableNumber(input.bodyFatPct),
        bodyFatKg: toNullableNumber(input.bodyFatKg),
        leanMassKg: toNullableNumber(input.leanMassKg),
        muscleMassKg: toNullableNumber(input.muscleMassKg),
        totalBodyWaterL: toNullableNumber(input.totalBodyWaterL),
        visceralFatLevel: toNullableNumber(input.visceralFatLevel),
        bmrKcal: toNullableNumber(input.bmrKcal),
        phaseAngle: toNullableNumber(input.phaseAngle),
        notes: input.notes || null,
        recordedBy: ctx.user.id,
      }),
  ),
)

function firstZodMessage(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? 'Geçersiz veri gönderildi.'
}

export async function createMeasurementAction(
  clientId: string,
  input: MeasurementFormValues,
): Promise<ClientActionResult> {
  const parsed = measurementFormSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: firstZodMessage(parsed.error) }
  }

  try {
    await createMeasurementForClinic(clientId, parsed.data)
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Ölçüm kaydedilemedi.',
    }
  }
  revalidatePath(`/danisanlar/${clientId}`)
  return { success: true }
}

// --- Hedef oluşturma / tamamlama (GÖREV 4) ----------------------------------

const createGoalForClinic = withAuth(
  withAudit(
    {
      action: 'create',
      entityType: 'client_goal',
      entityId: (_args: [string, GoalFormValues], result: { id: string } | undefined) =>
        result?.id ?? null,
    },
    async (ctx, clientId: string, input: GoalFormValues) =>
      createGoal(db, ctx.scope.clinicId, clientId, {
        type: input.type,
        targetValue: Number(input.targetValue),
        targetDate: input.targetDate || null,
        startValue: Number(input.startValue),
      }),
  ),
)

export async function createGoalAction(
  clientId: string,
  input: GoalFormValues,
): Promise<ClientActionResult> {
  const parsed = goalFormSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: firstZodMessage(parsed.error) }
  }

  try {
    await createGoalForClinic(clientId, parsed.data)
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Hedef kaydedilemedi.',
    }
  }
  revalidatePath(`/danisanlar/${clientId}`)
  return { success: true }
}

const achieveGoalForClinic = withAuth(
  withAudit(
    { action: 'update', entityType: 'client_goal', entityId: ([goalId]: [string]) => goalId },
    async (ctx, goalId: string) => markGoalAchieved(db, ctx.scope.clinicId, goalId),
  ),
)

export async function achieveGoalAction(
  goalId: string,
  clientId: string,
): Promise<ClientActionResult> {
  const goal = await achieveGoalForClinic(goalId)
  if (!goal) {
    return { success: false, error: 'Hedef bulunamadı.' }
  }
  revalidatePath(`/danisanlar/${clientId}`)
  return { success: true }
}

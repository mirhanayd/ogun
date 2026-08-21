'use server'

import { db } from '@ogun/db'
import { upsertClientHealth } from '@ogun/db/queries'
import { withClientAuth } from '@/lib/authz'
import { withAudit } from '@/lib/audit'
import {
  anamnesisFormSchema,
  listFromText,
  type AnamnesisFormValues,
} from '@/lib/validation/anamnesis-schemas'
import type { ClientActionResult } from '../../actions'

// GitHub issue #19 / Prompt 4.3, GÖREV 1 — anamnez otomatik kaydı.
// revalidatePath BİLEREK YOK: bu action bir Server Component'i yeniden
// render ETMEK için değil, 800ms debounce'lu bir arka plan yazması için
// çağrılıyor (bkz. anamnesis-form.tsx useAutosave) — sayfayı yeniden
// render etmek her tuş vuruşu grubunda formun kendi state'ini sıfırlar/
// odağı kaybettirirdi, autosave'in amacı bunun TAM TERSİ (kesintisiz yazma).

const upsertClientHealthForClinic = withClientAuth(
  withAudit(
    { action: 'update', entityType: 'client_health', entityId: ([clientId]: [string, AnamnesisFormValues]) => clientId },
    async (ctx, clientId: string, input: AnamnesisFormValues) =>
      upsertClientHealth(db, ctx.scope.clinicId, clientId, {
        conditions: listFromText(input.conditions),
        medications: listFromText(input.medications),
        allergies: input.allergies,
        intolerances: input.intolerances,
        surgeries: input.surgeries || null,
        familyHistory: input.familyHistory || null,
        smokingStatus: input.smokingStatus || null,
        alcoholUse: input.alcoholUse || null,
        mealsPerDay: input.mealsPerDay ? Number(input.mealsPerDay) : null,
        eatingOutFrequency: input.eatingOutFrequency || null,
        waterIntakeMl: input.waterIntakeMl ? Number(input.waterIntakeMl) : null,
        activityLevel: input.activityLevel,
        activityNotes: input.activityNotes || null,
        sleepHours: input.sleepHours ? Number(input.sleepHours) : null,
        sleepQuality: input.sleepQuality || null,
        bowelHabits: input.bowelHabits || null,
      }),
  ),
)

function firstZodMessage(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? 'Geçersiz veri gönderildi.'
}

export async function saveAnamnesisAction(
  clientId: string,
  input: AnamnesisFormValues,
): Promise<ClientActionResult> {
  const parsed = anamnesisFormSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: firstZodMessage(parsed.error) }
  }

  try {
    await upsertClientHealthForClinic(clientId, parsed.data)
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Anamnez kaydedilemedi.' }
  }
  return { success: true }
}

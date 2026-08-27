'use server'

import { db } from '@ogun/db'
import { upsertSubscriptionSelectionForUser } from '@ogun/db/queries'
import { requireAuth } from '@/lib/authz'
import {
  selectSubscriptionPlanSchema,
  type SelectSubscriptionPlanFormValues,
} from '@/lib/validation/subscription-schemas'

export async function saveRequiredPlanSelectionAction(input: SelectSubscriptionPlanFormValues) {
  const parsed = selectSubscriptionPlanSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0]?.message ?? 'Geçersiz plan seçimi.' }
  }

  const { user } = await requireAuth()
  await upsertSubscriptionSelectionForUser(db, user.id, parsed.data)
  return { success: true as const }
}

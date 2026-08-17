// Abonelik sorguları — GitHub issue #41 / Prompt 7.3, GÖREV 1.
// clients.ts/appointments.ts üstündeki notla AYNI desen: clinicId burada düz
// bir string, "clinicId'siz sorgu yazılamaz" kuralı apps/web/src/lib/authz.ts
// (ClinicScope) tarafında tip seviyesinde zorlanır.
import { and, desc, eq } from 'drizzle-orm'
import {
  subscriptionEvents,
  subscriptions,
  type PaymentProviderNameValue,
  type SubscriptionPlan,
} from '../schema/subscriptions'
import type { Database } from '../client'

export async function getSubscriptionForClinic(db: Database, clinicId: string) {
  const [row] = await db.select().from(subscriptions).where(eq(subscriptions.clinicId, clinicId)).limit(1)
  return row ?? null
}

export interface UpsertSubscriptionInput {
  planCode: SubscriptionPlan
  provider: PaymentProviderNameValue
  providerCustomerId?: string | null
  providerSubscriptionId?: string | null
  currentPeriodStart?: Date | null
  currentPeriodEnd?: Date | null
  cancelAtPeriodEnd?: boolean
}

// Klinik başına TEK satır (bkz. schema/subscriptions.ts uniqueIndex notu) —
// plan seçimi/değişikliği bu satırı GÜNCELLER (onConflictDoUpdate), yeni
// satır AÇMAZ.
export async function upsertSubscriptionForClinic(db: Database, clinicId: string, input: UpsertSubscriptionInput) {
  const [row] = await db
    .insert(subscriptions)
    .values({ clinicId, ...input })
    .onConflictDoUpdate({
      target: subscriptions.clinicId,
      set: input,
    })
    .returning()
  if (!row) throw new Error('Abonelik kaydedilemedi.')
  return row
}

export interface InsertSubscriptionEventInput {
  subscriptionId?: string | null
  eventType: string
  payload?: Record<string, unknown> | null
  occurredAt?: Date
}

export async function insertSubscriptionEvent(db: Database, clinicId: string, input: InsertSubscriptionEventInput) {
  const [row] = await db
    .insert(subscriptionEvents)
    .values({ clinicId, ...input })
    .returning()
  if (!row) throw new Error('Abonelik olayı kaydedilemedi.')
  return row
}

export async function listSubscriptionEventsForClinic(db: Database, clinicId: string) {
  return db
    .select()
    .from(subscriptionEvents)
    .where(and(eq(subscriptionEvents.clinicId, clinicId)))
    .orderBy(desc(subscriptionEvents.occurredAt))
}

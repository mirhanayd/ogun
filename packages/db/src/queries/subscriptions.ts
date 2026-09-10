// Abonelik sorguları — GitHub issue #41 / Prompt 7.3, GÖREV 1.
// clients.ts/appointments.ts üstündeki notla AYNI desen: clinicId burada düz
// bir string, "clinicId'siz sorgu yazılamaz" kuralı apps/web/src/lib/authz.ts
// (ClinicScope) tarafında tip seviyesinde zorlanır.
import { and, desc, eq } from 'drizzle-orm'
import {
  subscriptionEvents,
  subscriptionSelections,
  subscriptions,
  type PaymentProviderNameValue,
  type SubscriptionBillingCycle,
  type SubscriptionPlan,
  type SubscriptionEventSource,
} from '../schema/subscriptions'
import { clinics } from '../schema/tenancy'
import type { Database } from '../client'

export async function getSubscriptionForClinic(db: Database, clinicId: string) {
  const [row] = await db.select().from(subscriptions).where(eq(subscriptions.clinicId, clinicId)).limit(1)
  return row ?? null
}

export async function getSubscriptionSelectionForUser(db: Database, userId: string) {
  const [row] = await db
    .select()
    .from(subscriptionSelections)
    .where(eq(subscriptionSelections.userId, userId))
    .limit(1)
  return row ?? null
}

export async function upsertSubscriptionSelectionForUser(
  db: Database,
  userId: string,
  input: { planCode: SubscriptionPlan; billingCycle: SubscriptionBillingCycle },
) {
  const [row] = await db
    .insert(subscriptionSelections)
    .values({ userId, ...input })
    .onConflictDoUpdate({ target: subscriptionSelections.userId, set: input })
    .returning()
  if (!row) throw new Error('Plan seçimi kaydedilemedi.')
  return row
}

export async function getSubscriptionByCheckoutToken(db: Database, checkoutToken: string) {
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.checkoutToken, checkoutToken))
    .limit(1)
  return row ?? null
}

export async function getSubscriptionByProviderReference(db: Database, providerSubscriptionId: string) {
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.providerSubscriptionId, providerSubscriptionId))
    .limit(1)
  return row ?? null
}

export interface UpsertSubscriptionInput {
  planCode: SubscriptionPlan
  billingCycle?: SubscriptionBillingCycle
  provider: PaymentProviderNameValue
  providerCustomerId?: string | null
  providerSubscriptionId?: string | null
  checkoutToken?: string | null
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
  source?: SubscriptionEventSource
  actorUserId?: string | null
  actorPlatformStaffId?: string | null
  providerEventId?: string | null
}

export async function applyClinicSubscriptionSelection(
  db: Database,
  clinicId: string,
  input: UpsertSubscriptionInput & { actorUserId: string; eventType?: string },
) {
  return db.transaction(async (tx) => {
    const { actorUserId, eventType = 'plan_selected', ...subscriptionInput } = input
    const [subscription] = await tx
      .insert(subscriptions)
      .values({ clinicId, ...subscriptionInput })
      .onConflictDoUpdate({ target: subscriptions.clinicId, set: subscriptionInput })
      .returning()
    if (!subscription) throw new Error('Abonelik kaydedilemedi.')
    await tx.insert(subscriptionEvents).values({
      clinicId,
      subscriptionId: subscription.id,
      eventType,
      source: 'clinic_user',
      actorUserId,
      payload: { planCode: subscription.planCode, billingCycle: subscription.billingCycle, provider: subscription.provider },
    })
    await tx.update(clinics).set({ subscriptionStatus: 'active', updatedAt: new Date() }).where(eq(clinics.id, clinicId))
    return subscription
  })
}

export async function requestClinicSubscriptionCancellation(
  db: Database,
  input: { clinicId: string; subscriptionId: string; actorUserId: string },
) {
  return db.transaction(async (tx) => {
    const [subscription] = await tx
      .update(subscriptions)
      .set({ cancelAtPeriodEnd: true, updatedAt: new Date() })
      .where(and(eq(subscriptions.id, input.subscriptionId), eq(subscriptions.clinicId, input.clinicId)))
      .returning()
    if (!subscription) throw new Error('Abonelik bulunamadı.')
    await tx.insert(subscriptionEvents).values({
      clinicId: input.clinicId,
      subscriptionId: subscription.id,
      eventType: 'cancel_requested',
      source: 'clinic_user',
      actorUserId: input.actorUserId,
      payload: { planCode: subscription.planCode, currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null },
    })
    return subscription
  })
}

export async function recordProviderSubscriptionStatus(
  db: Database,
  input: {
    clinicId: string
    subscriptionId: string
    status: 'active' | 'past_due'
    eventType: string
    providerEventId: string
    occurredAt: Date
    payload: Record<string, unknown>
  },
) {
  return db.transaction(async (tx) => {
    const { clinicId, subscriptionId, status, eventType, providerEventId, occurredAt, payload } = input
    const [event] = await tx
      .insert(subscriptionEvents)
      .values({ clinicId, subscriptionId, eventType, providerEventId, occurredAt, payload, source: 'provider', actorUserId: null })
      .onConflictDoNothing({ target: subscriptionEvents.providerEventId })
      .returning({ id: subscriptionEvents.id })
    if (!event) return { duplicate: true as const }
    await tx.update(clinics).set({ subscriptionStatus: status, updatedAt: new Date() }).where(eq(clinics.id, clinicId))
    return { duplicate: false as const }
  })
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

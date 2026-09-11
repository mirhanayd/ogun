// Abonelik sorguları — GitHub issue #41 / Prompt 7.3, GÖREV 1.
// clients.ts/appointments.ts üstündeki notla AYNI desen: clinicId burada düz
// bir string, "clinicId'siz sorgu yazılamaz" kuralı apps/web/src/lib/authz.ts
// (ClinicScope) tarafında tip seviyesinde zorlanır.
import { and, desc, eq, sql } from 'drizzle-orm'
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
import { providerWebhookReceipts } from '../schema/operations'
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
    provider: 'iyzico' | 'paytr' | 'manuel'
    payloadHash: string
    occurredAt: Date
    payload: Record<string, unknown>
  },
) {
  return db.transaction(async (tx) => {
    const { clinicId, subscriptionId, status, eventType, providerEventId, provider, payloadHash, occurredAt, payload } = input
    const [receipt] = await tx.insert(providerWebhookReceipts).values({
      provider, providerEventId, eventType, payloadHash, providerOccurredAt: occurredAt,
      status: 'processing', metadata: { subscriptionId },
    }).onConflictDoNothing({ target: [providerWebhookReceipts.provider, providerWebhookReceipts.providerEventId] })
      .returning({ id: providerWebhookReceipts.id })
    if (!receipt) {
      await tx.update(providerWebhookReceipts).set({ attemptCount: sql`${providerWebhookReceipts.attemptCount} + 1` })
        .where(and(eq(providerWebhookReceipts.provider, provider), eq(providerWebhookReceipts.providerEventId, providerEventId)))
      return { duplicate: true as const, outOfOrder: false as const }
    }
    const [latest] = await tx.select({ occurredAt: subscriptionEvents.occurredAt })
      .from(subscriptionEvents)
      .where(and(eq(subscriptionEvents.subscriptionId, subscriptionId), eq(subscriptionEvents.source, 'provider'), eq(subscriptionEvents.provider, provider)))
      .orderBy(desc(subscriptionEvents.occurredAt)).limit(1)
    const [event] = await tx
      .insert(subscriptionEvents)
      .values({ clinicId, subscriptionId, eventType, providerEventId, provider, occurredAt, payload, source: 'provider', actorUserId: null })
      .onConflictDoNothing({ target: [subscriptionEvents.provider, subscriptionEvents.providerEventId] })
      .returning({ id: subscriptionEvents.id })
    if (!event) {
      await tx.update(providerWebhookReceipts).set({ status: 'processed', processedAt: new Date(), metadata: { subscriptionId, legacyDuplicate: true } }).where(eq(providerWebhookReceipts.id, receipt.id))
      return { duplicate: true as const, outOfOrder: false as const }
    }
    const outOfOrder = Boolean(latest && latest.occurredAt.getTime() > occurredAt.getTime())
    if (!outOfOrder) {
      await tx.update(clinics).set({ subscriptionStatus: status, updatedAt: new Date() }).where(eq(clinics.id, clinicId))
    }
    await tx.update(providerWebhookReceipts).set({ status: 'processed', processedAt: new Date(), metadata: { subscriptionId, outOfOrder } })
      .where(eq(providerWebhookReceipts.id, receipt.id))
    return { duplicate: false as const, outOfOrder }
  })
}

export async function recordProviderWebhookFailure(db: Database, input: {
  provider: 'iyzico' | 'paytr' | 'manuel'
  providerEventId: string
  eventType: string
  payloadHash: string
  occurredAt: Date
  errorCode: string
}) {
  await db.insert(providerWebhookReceipts).values({
    provider: input.provider, providerEventId: input.providerEventId, eventType: input.eventType,
    payloadHash: input.payloadHash, providerOccurredAt: input.occurredAt, status: 'failed',
    processedAt: new Date(), errorCode: input.errorCode, errorSummary: 'Webhook processing failed.',
  }).onConflictDoUpdate({ target: [providerWebhookReceipts.provider, providerWebhookReceipts.providerEventId], set: {
    status: 'failed', processedAt: new Date(), errorCode: input.errorCode,
    errorSummary: 'Webhook processing failed.', attemptCount: sql`${providerWebhookReceipts.attemptCount} + 1`,
  } })
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

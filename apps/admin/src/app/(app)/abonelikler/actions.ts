'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { db } from '@ogun/db'
import {
  activateManualSubscription,
  changeManualSubscriptionBillingCycle,
  changeManualSubscriptionPlan,
  correctManualSubscriptionStatus,
  extendSubscriptionTrial,
  getSubscriptionEmailNotificationByEvent,
  setManualSubscriptionCancellation,
} from '@ogun/db/queries'
import {
  SUBSCRIPTION_BILLING_CYCLES,
  SUBSCRIPTION_PLANS,
  SUBSCRIPTION_STATUSES,
} from '@ogun/subscription-core'
import { requirePlatformPermission } from '@/lib/platform-authz'
import { getPlatformRequestMetadata } from '@/lib/platform-audit'
import { dispatchSubscriptionNotification } from '@/lib/subscription-email'

const field = (form: FormData, name: string) => {
  const value = form.get(name)
  return typeof value === 'string' ? value.trim() : ''
}
const target = (clinicId: string, key: 'mesaj' | 'hata', value: string) => {
  const url = new URL(`/abonelikler/${encodeURIComponent(clinicId)}`, 'http://admin.local')
  url.searchParams.set(key, value)
  return `${url.pathname}${url.search}`
}
async function actor() {
  const ctx = await requirePlatformPermission('subscriptions.manage')
  return {
    actorUserId: ctx.user.id,
    platformStaffId: ctx.staff.id,
    ...(await getPlatformRequestMetadata()),
  }
}
async function notify(eventId: string) {
  const notification = await getSubscriptionEmailNotificationByEvent(db, eventId)
  if (notification) await dispatchSubscriptionNotification(notification.id)
}
async function finish(
  clinicId: string,
  message: string,
  operation: () => Promise<{ eventId: string }>,
) {
  try {
    const result = await operation()
    await notify(result.eventId)
  } catch (error) {
    redirect(
      target(clinicId, 'hata', error instanceof Error ? error.message : 'İşlem tamamlanamadı.'),
    )
  }
  revalidatePath('/abonelikler')
  revalidatePath(`/abonelikler/${clinicId}`)
  revalidatePath(`/klinikler/${clinicId}`)
  redirect(target(clinicId, 'mesaj', message))
}

export async function extendTrialAction(formData: FormData) {
  const clinicId = field(formData, 'clinicId')
  const request = await actor()
  return finish(clinicId, 'Deneme süresi uzatıldı.', () =>
    extendSubscriptionTrial(db, {
      ...request,
      clinicId,
      days: Number(field(formData, 'days')),
      reason: field(formData, 'reason'),
    }),
  )
}

export async function changePlanAction(formData: FormData) {
  const clinicId = field(formData, 'clinicId')
  const planCode = SUBSCRIPTION_PLANS.find((value) => value === field(formData, 'planCode'))
  const request = await actor()
  return finish(clinicId, 'Plan güncellendi.', () => {
    if (!planCode) throw new Error('Geçersiz plan.')
    return changeManualSubscriptionPlan(db, {
      ...request,
      clinicId,
      planCode,
      reason: field(formData, 'reason'),
    })
  })
}

export async function changeBillingCycleAction(formData: FormData) {
  const clinicId = field(formData, 'clinicId')
  const billingCycle = SUBSCRIPTION_BILLING_CYCLES.find(
    (value) => value === field(formData, 'billingCycle'),
  )
  const request = await actor()
  return finish(clinicId, 'Faturalama dönemi güncellendi.', () => {
    if (!billingCycle) throw new Error('Geçersiz faturalama dönemi.')
    return changeManualSubscriptionBillingCycle(db, {
      ...request,
      clinicId,
      billingCycle,
      reason: field(formData, 'reason'),
    })
  })
}

export async function setCancellationAction(formData: FormData) {
  const clinicId = field(formData, 'clinicId')
  const cancelAtPeriodEnd = field(formData, 'cancelAtPeriodEnd') === 'true'
  const request = await actor()
  return finish(
    clinicId,
    cancelAtPeriodEnd ? 'İptal talebi kaydedildi.' : 'İptal talebi geri alındı.',
    () =>
      setManualSubscriptionCancellation(db, {
        ...request,
        clinicId,
        cancelAtPeriodEnd,
        reason: field(formData, 'reason'),
      }),
  )
}

export async function correctStatusAction(formData: FormData) {
  const clinicId = field(formData, 'clinicId')
  const status = SUBSCRIPTION_STATUSES.find((value) => value === field(formData, 'status'))
  const request = await actor()
  return finish(clinicId, 'Abonelik durumu düzeltildi.', () => {
    if (!status) throw new Error('Geçersiz abonelik durumu.')
    return correctManualSubscriptionStatus(db, {
      ...request,
      clinicId,
      status,
      reason: field(formData, 'reason'),
    })
  })
}

export async function activateSubscriptionAction(formData: FormData) {
  const clinicId = field(formData, 'clinicId')
  const request = await actor()
  return finish(clinicId, 'Manuel abonelik aktive edildi.', () =>
    activateManualSubscription(db, {
      ...request,
      clinicId,
      reason: field(formData, 'reason'),
    }),
  )
}

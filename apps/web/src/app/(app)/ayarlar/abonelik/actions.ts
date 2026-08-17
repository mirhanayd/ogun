'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@ogun/db'
import {
  getSubscriptionForClinic,
  insertSubscriptionEvent,
  updateClinicSmsTemplate,
  updateClinicSubscriptionStatus,
  upsertSubscriptionForClinic,
} from '@ogun/db/queries'
import { requireRole } from '@/lib/authz'
import { getPaymentProvider } from '@/lib/subscription/payment-provider'
import { runSmsReminderSweepForClinic, type ReminderSweepResult } from '@/lib/sms/reminder-runner'
import {
  selectSubscriptionPlanSchema,
  smsTemplateSettingSchema,
  type SelectSubscriptionPlanFormValues,
  type SmsTemplateSettingFormValues,
} from '@/lib/validation/subscription-schemas'

// GitHub issue #41 / Prompt 7.3 — abonelik/SMS ayarları mutasyonları.
// veri-guvenligi/actions.ts / paylasim/actions.ts (GitHub #12, #36) ile AYNI
// desen: fırlatmak yerine ActionResult, ilk satırda requireRole (finans/
// actions.ts'teki GİBİ ['owner'] — abonelik/plan/iptal KARARI sadece klinik
// sahibinin yetkisinde, bkz. queries.ts dosya başı notu "görme" vs
// "değiştirme" ayrımı).
export interface SubscriptionActionResult {
  success: boolean
  error?: string
}

function firstZodMessage(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? 'Geçersiz veri gönderildi.'
}

// GÖREV 1 — plan seçimi. getPaymentProvider() (manuel sağlayıcı) çağırıp
// dönen sonucu subscriptions + subscription_events'e YAZAR VE
// clinics.subscriptionStatus'u 'active'e senkronlar — üçü de TEK bir mantıksal
// işlem (bkz. queries/clinics.ts updateClinicSubscriptionStatus notu).
export async function selectSubscriptionPlanAction(
  input: SelectSubscriptionPlanFormValues,
): Promise<SubscriptionActionResult> {
  const parsed = selectSubscriptionPlanSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: firstZodMessage(parsed.error) }
  }

  const ctx = await requireRole('owner')
  const provider = getPaymentProvider()
  const checkout = await provider.startSubscription({
    clinicId: ctx.scope.clinicId,
    clinicName: ctx.user.name,
    billingEmail: ctx.user.email,
    planCode: parsed.data.planCode,
  })

  const subscription = await upsertSubscriptionForClinic(db, ctx.scope.clinicId, {
    planCode: parsed.data.planCode,
    provider: checkout.provider,
    providerCustomerId: checkout.providerCustomerId,
    providerSubscriptionId: checkout.providerSubscriptionId,
    currentPeriodStart: checkout.currentPeriodStart,
    currentPeriodEnd: checkout.currentPeriodEnd,
    cancelAtPeriodEnd: false,
  })
  await insertSubscriptionEvent(db, ctx.scope.clinicId, {
    subscriptionId: subscription.id,
    eventType: 'plan_selected',
    payload: { planCode: parsed.data.planCode, provider: checkout.provider },
  })
  await updateClinicSubscriptionStatus(db, ctx.scope.clinicId, 'active')

  revalidatePath('/ayarlar/abonelik')
  revalidatePath('/panel')
  return { success: true }
}

// GÖREV 1 — iptal. Manuel sağlayıcıda dönem sonuna kadar erişim DEVAM eder
// (cancelAtPeriodEnd=true) — clinics.subscriptionStatus HEMEN 'canceled'a
// çekilmiyor, roadmap'in "erişim asla kesilmemeli" ilkesiyle TUTARLI: bir
// iptal, o anki erişimi de kesmemeli, sadece yenilenmeyeceğini işaretlemeli.
export async function cancelSubscriptionAction(): Promise<SubscriptionActionResult> {
  const ctx = await requireRole('owner')
  const subscription = await getSubscriptionForClinic(db, ctx.scope.clinicId)
  if (!subscription) {
    return { success: false, error: 'Aktif bir abonelik bulunamadı.' }
  }

  const provider = getPaymentProvider()
  await provider.cancelSubscription({
    clinicId: ctx.scope.clinicId,
    providerSubscriptionId: subscription.providerSubscriptionId,
  })

  await upsertSubscriptionForClinic(db, ctx.scope.clinicId, {
    planCode: subscription.planCode,
    provider: subscription.provider,
    providerCustomerId: subscription.providerCustomerId,
    providerSubscriptionId: subscription.providerSubscriptionId,
    currentPeriodStart: subscription.currentPeriodStart,
    currentPeriodEnd: subscription.currentPeriodEnd,
    cancelAtPeriodEnd: true,
  })
  await insertSubscriptionEvent(db, ctx.scope.clinicId, {
    subscriptionId: subscription.id,
    eventType: 'cancel_requested',
    payload: { planCode: subscription.planCode },
  })

  revalidatePath('/ayarlar/abonelik')
  return { success: true }
}

// GÖREV 3 — "Klinik ayarlarında mesaj şablonu özelleştirilebilsin" (SMS).
// paylasim/actions.ts updateWhatsappTemplateAction ile AYNI desen ve AYNI
// rol kısıtı (owner, dietitian — SMS şablonu finansal bir karar değil).
export async function updateSmsTemplateAction(
  input: SmsTemplateSettingFormValues,
): Promise<SubscriptionActionResult> {
  const parsed = smsTemplateSettingSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: firstZodMessage(parsed.error) }
  }

  const { scope } = await requireRole('owner', 'dietitian')
  const trimmed = parsed.data.smsReminderTemplate.trim()
  await updateClinicSmsTemplate(db, scope.clinicId, trimmed.length > 0 ? trimmed : null)
  revalidatePath('/ayarlar/abonelik')
  return { success: true }
}

// GÖREV 3 — "24 saat önce OTOMATİK SMS". Bu repoda gerçek bir cron/worker
// KURULU DEĞİL (bkz. lib/sms/reminder-eligibility.ts dosya başı notu) — bu
// action, üretimde bir zamanlayıcının çağıracağı sweep'i MANUEL olarak
// (bir buton üzerinden, /ayarlar/abonelik) tetiklemeyi sağlar; hem demo/pilot
// için kullanılabilir hem de reminder-runner.ts'in gerçek bir server action
// üzerinden erişilebilir olduğunu garanti eder (withAudit ZİNCİRİ dışında —
// audit burada atlanıyor çünkü bu bir "sistem işlemi" tetikleyicisi, danışan
// verisine doğrudan bir OKUMA/YAZMA değil; sms_logs'un kendisi zaten kalıcı
// bir kayıt).
export const runSmsReminderSweepAction = async (): Promise<
  SubscriptionActionResult & { result?: ReminderSweepResult }
> => {
  const ctx = await requireRole('owner', 'dietitian')
  const result = await runSmsReminderSweepForClinic(ctx.scope.clinicId)
  revalidatePath('/ayarlar/abonelik')
  return { success: true, result }
}

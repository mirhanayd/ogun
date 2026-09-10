export type SubscriptionPlan = 'başlangıç' | 'klinik' | 'kurumsal'
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled'
export type SubscriptionBillingCycle = 'monthly' | 'yearly'
export type PaymentProviderName = 'manuel' | 'iyzico' | 'paytr'

export const SUBSCRIPTION_PLANS = ['başlangıç', 'klinik', 'kurumsal'] as const
export const SUBSCRIPTION_STATUSES = ['trialing', 'active', 'past_due', 'canceled'] as const
export const SUBSCRIPTION_BILLING_CYCLES = ['monthly', 'yearly'] as const
export const PAYMENT_PROVIDERS = ['manuel', 'iyzico', 'paytr'] as const

export interface PlanLimits {
  maxClients: number | null
  maxUsers: number
  smsQuotaPerMonth: number
}

export interface PlanDefinition {
  code: SubscriptionPlan
  label: string
  description: string
  limits: PlanLimits
  prices: Record<SubscriptionBillingCycle, number>
}

export const PLAN_DEFINITIONS: Record<SubscriptionPlan, PlanDefinition> = {
  başlangıç: {
    code: 'başlangıç',
    label: 'Tek Kullanıcı Yönetici Hesabı',
    description: 'Bağımsız çalışan yönetici/diyetisyen için tek kullanıcı hesabı.',
    limits: { maxClients: 60, maxUsers: 1, smsQuotaPerMonth: 50 },
    prices: { monthly: 2500, yearly: 28000 },
  },
  klinik: {
    code: 'klinik',
    label: 'Yönetici + 4 Diyetisyen',
    description: 'Bir yönetici ve dört diyetisyen olmak üzere toplam 5 kullanıcı.',
    limits: { maxClients: 400, maxUsers: 5, smsQuotaPerMonth: 300 },
    prices: { monthly: 3000, yearly: 30000 },
  },
  kurumsal: {
    code: 'kurumsal',
    label: 'Kurumsal',
    description: 'Büyük klinik/zincirler için sınırsız kullanıcı ve danışan.',
    limits: { maxClients: null, maxUsers: 9999, smsQuotaPerMonth: 2000 },
    prices: { monthly: 0, yearly: 0 },
  },
}

export const TRIAL_PLAN_LIMITS: PlanLimits = PLAN_DEFINITIONS.başlangıç.limits

export function getPlanLimits(planCode: SubscriptionPlan | null, isTrialing: boolean): PlanLimits {
  if (isTrialing || !planCode) return TRIAL_PLAN_LIMITS
  return PLAN_DEFINITIONS[planCode].limits
}

export function getPlanPriceLabel(
  planCode: SubscriptionPlan,
  billingCycle: SubscriptionBillingCycle,
) {
  const price = PLAN_DEFINITIONS[planCode].prices[billingCycle]
  return price === 0
    ? 'Özel fiyatlandırma'
    : `${price.toLocaleString('tr-TR')} TL / ${billingCycle === 'monthly' ? 'ay' : 'yıl'}`
}

export interface SubscriptionConsistencyInput {
  clinicStatus: SubscriptionStatus
  trialEndsAt: Date | null
  subscription: null | {
    provider: PaymentProviderName
    providerSubscriptionId: string | null
    cancelAtPeriodEnd: boolean
    currentPeriodEnd: Date | null
  }
  now: Date
}

export interface SubscriptionDrift {
  code:
    | 'active_without_subscription'
    | 'expired_trial'
    | 'expired_cancel_pending'
    | 'manual_reference_missing'
  severity: 'error' | 'warning'
  message: string
}

export function detectSubscriptionDrift(input: SubscriptionConsistencyInput): SubscriptionDrift[] {
  const drift: SubscriptionDrift[] = []
  if (input.clinicStatus === 'active' && !input.subscription)
    drift.push({
      code: 'active_without_subscription',
      severity: 'error',
      message: 'Klinik aktif görünüyor ancak canonical abonelik satırı bulunmuyor.',
    })
  if (
    input.clinicStatus === 'trialing' &&
    input.trialEndsAt &&
    input.trialEndsAt.getTime() < input.now.getTime()
  )
    drift.push({
      code: 'expired_trial',
      severity: 'error',
      message: 'Deneme süresi geçmiş olmasına rağmen klinik trialing durumunda.',
    })
  if (
    input.clinicStatus === 'active' &&
    input.subscription?.cancelAtPeriodEnd &&
    input.subscription.currentPeriodEnd &&
    input.subscription.currentPeriodEnd.getTime() < input.now.getTime()
  )
    drift.push({
      code: 'expired_cancel_pending',
      severity: 'error',
      message: 'İptal dönemi bitmiş olmasına rağmen klinik hâlâ aktif görünüyor.',
    })
  if (input.subscription?.provider === 'manuel' && !input.subscription.providerSubscriptionId)
    drift.push({
      code: 'manual_reference_missing',
      severity: 'warning',
      message: 'Manuel aboneliğin teknik abonelik referansı eksik.',
    })
  return drift
}

export function assertManualStatusTransition(from: SubscriptionStatus, to: SubscriptionStatus) {
  const allowed: Record<SubscriptionStatus, readonly SubscriptionStatus[]> = {
    trialing: ['active', 'canceled'],
    active: ['past_due', 'canceled'],
    past_due: ['active', 'canceled'],
    canceled: ['active'],
  }
  if (!allowed[from].includes(to))
    throw new Error(`${from} → ${to} durum düzeltmesine izin verilmiyor.`)
}

export function getPlanLimitViolations(
  planCode: SubscriptionPlan,
  usage: { activeClients: number; activeUsers: number },
) {
  const limits = PLAN_DEFINITIONS[planCode].limits
  return [
    ...(limits.maxClients !== null && usage.activeClients > limits.maxClients
      ? [`${usage.activeClients} aktif danışan / limit ${limits.maxClients}`]
      : []),
    ...(usage.activeUsers > limits.maxUsers
      ? [`${usage.activeUsers} aktif kullanıcı / limit ${limits.maxUsers}`]
      : []),
  ]
}

// GitHub issue #41 / Prompt 7.3, GÖREV 1 + GÖREV 2 — plan tanımları + limitleri.
// SAF (DB/React'tan habersiz) sabit veri — client-package.ts/finance-
// aggregation.ts (GitHub #40) ile AYNI gerekçe: DB'de ayrı bir "plan tanımı"
// tablosu YOK (schema/subscriptions.ts dosya başı notu), üç sabit plan için
// bu statik nesne yeterli ve testlerin gerçek bir veritabanı bağlantısı
// gerektirmeden çalışmasını sağlıyor.
import type { SubscriptionPlan } from '@ogun/db/schema'

export interface PlanLimits {
  // null = sınırsız.
  maxClients: number | null
  maxUsers: number
  smsQuotaPerMonth: number
}

export interface PlanDefinition {
  code: SubscriptionPlan
  label: string
  description: string
  limits: PlanLimits
  prices: { monthly: number; yearly: number }
}

// Roadmap (Prompt 7.3, GÖREV 1): "Başlangıç (tek diyetisyen), Klinik (5
// kullanıcı), Kurumsal". Fiyatlandırma bu issue'nun kapsamı DIŞINDA
// (roadmap'te belirtilmedi) — sadece kullanım limitleri (GÖREV 2) net.
// Kurumsal'ın limitleri roadmap'te SAYISAL olarak verilmedi; "sınırsız" (null)
// olarak ele alındı — büyük klinik/zincir hedeflediği için makul bir varsayım,
// gerçek fiyatlandırma/limit görüşmesi satış sürecinin konusu.
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

// 14 günlük ücretsiz deneme (GÖREV 1) — kart bilgisi istemeden başlar (bkz.
// clinics.trialEndsAt, packages/db/src/queries/clinics.ts createDraftClinic).
// Deneme süresinde hangi limitlerin geçerli olacağı roadmap'te AÇIKÇA
// belirtilmedi — "Başlangıç" planıyla AYNI limitler kullanılıyor: deneme,
// tek diyetisyenlik en küçük paketin özelliklerini görebilmeli, daha
// cömert bir deneme limiti diyetisyeni yükseltmeye teşvik etmez.
export const TRIAL_PLAN_LIMITS: PlanLimits = PLAN_DEFINITIONS.başlangıç.limits

export function getPlanLimits(planCode: SubscriptionPlan | null, isTrialing: boolean): PlanLimits {
  if (isTrialing || !planCode) return TRIAL_PLAN_LIMITS
  return PLAN_DEFINITIONS[planCode].limits
}

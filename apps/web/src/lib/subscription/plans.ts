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
    label: 'Başlangıç',
    description: 'Tek diyetisyen için — küçük ölçekli bağımsız pratisyenler.',
    limits: { maxClients: 60, maxUsers: 1, smsQuotaPerMonth: 50 },
  },
  klinik: {
    code: 'klinik',
    label: 'Klinik',
    description: '5 kullanıcıya kadar — birden fazla diyetisyenli klinikler.',
    limits: { maxClients: 400, maxUsers: 5, smsQuotaPerMonth: 300 },
  },
  kurumsal: {
    code: 'kurumsal',
    label: 'Kurumsal',
    description: 'Büyük klinik/zincirler için sınırsız kullanıcı ve danışan.',
    limits: { maxClients: null, maxUsers: 9999, smsQuotaPerMonth: 2000 },
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

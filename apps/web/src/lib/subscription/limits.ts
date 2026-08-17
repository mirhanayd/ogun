// GitHub issue #41 / Prompt 7.3, GÖREV 2 — "Kullanım limitleri [...] Limit
// aşımında engelleme değil, uyarı + yükseltme daveti (diyetisyenin danışan
// verisine erişimi ASLA kesilmemeli)". client-package.ts (GitHub #40, "kalan
// seans 1'e düşünce uyarı") ile AYNI gerekçe: SAF hesap mantığı, DB
// sorgularından/React'tan AYRI (bkz. limits.test.ts).
//
// KRİTİK TASARIM KARARI: bu modül SADECE bir uyarı NESNESİ üretir
// (UsageWarning[]) — hiçbir fonksiyonu throw ETMEZ, hiçbir çağıran taraf
// (queries/clients.ts, danışan oluşturma action'ı vb.) bu modülün sonucuna
// bakarak bir işlemi REDDETMEZ. apps/web/src/app/(app)/danisanlar/actions.ts
// createClientAction, computeUsageWarnings'i HİÇ ÇAĞIRMAZ — sadece
// /ayarlar/abonelik sayfası VE panel (dashboard) özet kartları bu uyarıları
// GÖSTERİR. Bu, roadmap'in "asla kesilmemeli" kuralını, bir yetkilendirme
// kontrolü (authz.ts requireRole gibi) yerine, tasarım/mimari düzeyde
// (fonksiyonun kendisi bir "izin ver/verme" API'si SUNMAZ) garanti eder.
import type { PlanLimits } from './plans'

export interface UsageSnapshot {
  clientCount: number
  userCount: number
  smsSentThisPeriod: number
}

export type UsageResource = 'clients' | 'users' | 'sms'
export type UsageWarningLevel = 'normal' | 'yaklaşıyor' | 'aşıldı'

export interface UsageWarning {
  resource: UsageResource
  level: UsageWarningLevel
  used: number
  // null = sınırsız plan (uyarı hiçbir zaman 'yaklaşıyor'/'aşıldı' olmaz).
  limit: number | null
  message: string | null
}

// %90 ve üzeri kullanım "yaklaşıyor" sayılır — measurements/panel
// referans-karşılaştırma renk eşiklerindeki (nutrition-core compareToReference,
// bkz. roadmap Prompt 2.3) "%90-110 yeterli" mantığıyla TUTARLI bir oran,
// farklı bir sihirli sayı icat etmek yerine.
const APPROACHING_RATIO = 0.9

function evaluate(resource: UsageResource, used: number, limit: number | null, labelTr: string): UsageWarning {
  if (limit === null) {
    return { resource, level: 'normal', used, limit, message: null }
  }
  if (used >= limit) {
    return {
      resource,
      level: 'aşıldı',
      used,
      limit,
      message: `${labelTr} limitini aştınız (${used}/${limit}). Danışan verilerinize erişiminiz KESİLMEDİ, ancak planınızı yükseltmenizi öneririz.`,
    }
  }
  if (used >= limit * APPROACHING_RATIO) {
    return {
      resource,
      level: 'yaklaşıyor',
      used,
      limit,
      message: `${labelTr} limitine yaklaşıyorsunuz (${used}/${limit}).`,
    }
  }
  return { resource, level: 'normal', used, limit, message: null }
}

// Tüm kaynaklar için (danışan sayısı, kullanıcı sayısı, SMS kotası) uyarı
// durumunu hesaplar. HİÇBİR koşulda exception fırlatmaz — dosya başı notundaki
// "asla erişim kesilmez" kuralının somutlaşması.
export function computeUsageWarnings(usage: UsageSnapshot, limits: PlanLimits): UsageWarning[] {
  return [
    evaluate('clients', usage.clientCount, limits.maxClients, 'Danışan sayısı'),
    evaluate('users', usage.userCount, limits.maxUsers, 'Kullanıcı sayısı'),
    evaluate('sms', usage.smsSentThisPeriod, limits.smsQuotaPerMonth, 'SMS kotası'),
  ]
}

export function hasAnyExceededLimit(warnings: readonly UsageWarning[]): boolean {
  return warnings.some((w) => w.level === 'aşıldı')
}

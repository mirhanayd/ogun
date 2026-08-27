import { describe, expect, it } from 'vitest'
import { computeUsageWarnings, hasAnyExceededLimit } from './limits'
import { PLAN_DEFINITIONS, TRIAL_PLAN_LIMITS, getPlanLimits } from './plans'

describe('getPlanLimits', () => {
  it('deneme sürümünde Başlangıç planıyla aynı limitleri kullanır', () => {
    expect(getPlanLimits('kurumsal', true)).toEqual(TRIAL_PLAN_LIMITS)
    expect(getPlanLimits(null, true)).toEqual(TRIAL_PLAN_LIMITS)
  })

  it('deneme bittiğinde seçilen planın limitlerini döner', () => {
    expect(getPlanLimits('klinik', false)).toEqual(PLAN_DEFINITIONS.klinik.limits)
  })
})

describe('zorunlu abonelik fiyatları', () => {
  it('tek kullanıcı planının aylık ve yıllık peşin fiyatlarını korur', () => {
    expect(PLAN_DEFINITIONS.başlangıç.prices).toEqual({ monthly: 2500, yearly: 28000 })
  })

  it('yönetici + 4 diyetisyen planının aylık ve yıllık peşin fiyatlarını korur', () => {
    expect(PLAN_DEFINITIONS.klinik.prices).toEqual({ monthly: 3000, yearly: 30000 })
  })
})

describe('computeUsageWarnings', () => {
  const limits = PLAN_DEFINITIONS.başlangıç.limits // { maxClients: 60, maxUsers: 1, smsQuotaPerMonth: 50 }

  it('kullanım limitin çok altındaysa "normal" döner', () => {
    const warnings = computeUsageWarnings({ clientCount: 5, userCount: 0, smsSentThisPeriod: 2 }, limits)
    expect(warnings.every((w) => w.level === 'normal')).toBe(true)
    expect(warnings.find((w) => w.resource === 'clients')?.message).toBeNull()
  })

  it('kullanım %90 eşiğine ulaşınca "yaklaşıyor" döner', () => {
    const warnings = computeUsageWarnings({ clientCount: 54, userCount: 0, smsSentThisPeriod: 2 }, limits)
    const clientsWarning = warnings.find((w) => w.resource === 'clients')
    expect(clientsWarning?.level).toBe('yaklaşıyor')
    expect(clientsWarning?.message).toContain('yaklaşıyorsunuz')
  })

  it('kullanım %90 eşiğinin altında kalırsa "yaklaşıyor" TETİKLENMEZ (sınır testi)', () => {
    // 60 * 0.9 = 54 → 53 hâlâ normal olmalı.
    const warnings = computeUsageWarnings({ clientCount: 53, userCount: 0, smsSentThisPeriod: 2 }, limits)
    expect(warnings.find((w) => w.resource === 'clients')?.level).toBe('normal')
  })

  it('kullanım limiti eşit/aştığında "aşıldı" döner VE erişimi engelleyecek bir mekanizma İÇERMEZ', () => {
    const warnings = computeUsageWarnings({ clientCount: 61, userCount: 0, smsSentThisPeriod: 2 }, limits)
    const clientsWarning = warnings.find((w) => w.resource === 'clients')
    expect(clientsWarning?.level).toBe('aşıldı')
    // "warn don't block" — dönen nesne SADECE bir mesaj/level, throw/exception
    // yok (fonksiyon zaten senkron ve hiçbir dalında hata fırlatmıyor, bu
    // test bunun REGRESYONA uğramadığını doğruluyor).
    expect(() => computeUsageWarnings({ clientCount: 999, userCount: 999, smsSentThisPeriod: 999 }, limits)).not.toThrow()
    expect(clientsWarning?.message).toContain('KESİLMEDİ')
  })

  it('sınırsız (null) limitte hiçbir zaman uyarı üretilmez', () => {
    const kurumsalLimits = PLAN_DEFINITIONS.kurumsal.limits // maxClients: null
    const warnings = computeUsageWarnings({ clientCount: 100_000, userCount: 1, smsSentThisPeriod: 1 }, kurumsalLimits)
    expect(warnings.find((w) => w.resource === 'clients')?.level).toBe('normal')
  })

  it('birden fazla kaynak aynı anda aşılabilir, bağımsız değerlendirilir', () => {
    const warnings = computeUsageWarnings({ clientCount: 61, userCount: 2, smsSentThisPeriod: 51 }, limits)
    expect(hasAnyExceededLimit(warnings)).toBe(true)
    expect(warnings.filter((w) => w.level === 'aşıldı')).toHaveLength(3)
  })
})

describe('hasAnyExceededLimit', () => {
  it('hiçbir uyarı aşılmamışsa false döner', () => {
    const warnings = computeUsageWarnings({ clientCount: 1, userCount: 1, smsSentThisPeriod: 1 }, PLAN_DEFINITIONS.klinik.limits)
    expect(hasAnyExceededLimit(warnings)).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import {
  decideReminderForAppointment,
  hasSmsConsent,
  isReminderEligibleAppointment,
  isWithinReminderWindow,
} from './reminder-eligibility'

const NOW = new Date('2026-08-17T10:00:00Z')

describe('isWithinReminderWindow', () => {
  it('tam 24 saat sonrası pencerenin İÇİNDEDİR', () => {
    const startsAt = new Date(NOW.getTime() + 24 * 60 * 60 * 1000)
    expect(isWithinReminderWindow(startsAt, NOW)).toBe(true)
  })

  it('24 saatten fazla uzaktaysa pencerenin DIŞINDADIR (henüz zamanı gelmedi)', () => {
    const startsAt = new Date(NOW.getTime() + 25 * 60 * 60 * 1000)
    expect(isWithinReminderWindow(startsAt, NOW)).toBe(false)
  })

  it('23 saat 40 dakika sonrası (30 dakikalık pencere içinde) İÇERİDEDİR', () => {
    const startsAt = new Date(NOW.getTime() + 23 * 60 * 60 * 1000 + 40 * 60 * 1000)
    expect(isWithinReminderWindow(startsAt, NOW)).toBe(true)
  })

  it('23 saat 20 dakika sonrası (pencere dışı, zaten geçmiş sayılır) DIŞARIDADIR', () => {
    const startsAt = new Date(NOW.getTime() + 23 * 60 * 60 * 1000 + 20 * 60 * 1000)
    expect(isWithinReminderWindow(startsAt, NOW)).toBe(false)
  })

  it('geçmişte kalan randevu için false döner', () => {
    const startsAt = new Date(NOW.getTime() - 60 * 60 * 1000)
    expect(isWithinReminderWindow(startsAt, NOW)).toBe(false)
  })
})

describe('hasSmsConsent', () => {
  it('smsConsentAt VE telefon doluysa true döner', () => {
    expect(hasSmsConsent({ smsConsentAt: new Date(), phone: '05551234567' })).toBe(true)
  })

  it('smsConsentAt NULL ise false döner (telefon olsa bile)', () => {
    expect(hasSmsConsent({ smsConsentAt: null, phone: '05551234567' })).toBe(false)
  })

  it('telefon yoksa false döner (rıza olsa bile)', () => {
    expect(hasSmsConsent({ smsConsentAt: new Date(), phone: null })).toBe(false)
  })
})

describe('isReminderEligibleAppointment', () => {
  it('planlandı/ertelendi uygun durumlardır', () => {
    expect(isReminderEligibleAppointment({ status: 'planlandı' })).toBe(true)
    expect(isReminderEligibleAppointment({ status: 'ertelendi' })).toBe(true)
  })

  it('geldi/gelmedi/iptal UYGUN DEĞİLDİR', () => {
    expect(isReminderEligibleAppointment({ status: 'geldi' })).toBe(false)
    expect(isReminderEligibleAppointment({ status: 'gelmedi' })).toBe(false)
    expect(isReminderEligibleAppointment({ status: 'iptal' })).toBe(false)
  })
})

describe('decideReminderForAppointment — bütünleşik karar', () => {
  const eligibleAppointment = {
    appointmentId: 'a1',
    startsAt: new Date(NOW.getTime() + 24 * 60 * 60 * 1000),
    status: 'planlandı' as const,
  }
  const consentedClient = { smsConsentAt: new Date('2026-01-01T00:00:00Z'), phone: '05551234567' }

  it('tüm koşullar sağlanınca gönderilmeli döner', () => {
    const decision = decideReminderForAppointment(eligibleAppointment, consentedClient, false, NOW)
    expect(decision).toEqual({ shouldSend: true, reason: 'ok' })
  })

  it('KRİTİK: rızası olmayan danışan İÇİN diğer TÜM koşullar sağlansa bile ASLA gönderilmez', () => {
    const noConsentClient = { smsConsentAt: null, phone: '05551234567' }
    const decision = decideReminderForAppointment(eligibleAppointment, noConsentClient, false, NOW)
    expect(decision.shouldSend).toBe(false)
    expect(decision.reason).toBe('rıza_yok')
  })

  it('zaten gönderilmişse (dedupe) tekrar gönderilmez', () => {
    const decision = decideReminderForAppointment(eligibleAppointment, consentedClient, true, NOW)
    expect(decision).toEqual({ shouldSend: false, reason: 'zaten_gönderildi' })
  })

  it('pencere dışındaysa gönderilmez', () => {
    const farAppointment = { ...eligibleAppointment, startsAt: new Date(NOW.getTime() + 48 * 60 * 60 * 1000) }
    const decision = decideReminderForAppointment(farAppointment, consentedClient, false, NOW)
    expect(decision).toEqual({ shouldSend: false, reason: 'zaman_penceresi_dışı' })
  })

  it('iptal edilmiş randevu için gönderilmez', () => {
    const cancelled = { ...eligibleAppointment, status: 'iptal' as const }
    const decision = decideReminderForAppointment(cancelled, consentedClient, false, NOW)
    expect(decision).toEqual({ shouldSend: false, reason: 'uygun_durum_değil' })
  })

  it('rıza yoksa VE pencere dışındaysa bile öncelik durum/pencere kontrolünden SONRA rızaya bakar (sıra testi)', () => {
    // Pencere kontrolü rıza kontrolünden ÖNCE — bu davranışın (hangi
    // sebebin raporlandığı) kasıtlı olduğunu belgeler.
    const farAppointment = { ...eligibleAppointment, startsAt: new Date(NOW.getTime() + 72 * 60 * 60 * 1000) }
    const noConsentClient = { smsConsentAt: null, phone: '05551234567' }
    const decision = decideReminderForAppointment(farAppointment, noConsentClient, false, NOW)
    expect(decision.reason).toBe('zaman_penceresi_dışı')
  })
})

import { describe, expect, it } from 'vitest'
import {
  isLowSessionWarning,
  lowSessionWarningMessage,
  remainingSessions,
  resolveDisplayStatus,
  type ClientPackageForWarning,
} from './client-package'

describe('remainingSessions', () => {
  it('kullanılan seans sayısını toplam seanstan düşer', () => {
    expect(remainingSessions({ sessionCount: 10, sessionsUsed: 7 })).toBe(3)
  })

  it('negatife düşmez', () => {
    expect(remainingSessions({ sessionCount: 5, sessionsUsed: 5 })).toBe(0)
  })
})

describe('resolveDisplayStatus', () => {
  const base: ClientPackageForWarning = {
    sessionCount: 10,
    sessionsUsed: 3,
    status: 'aktif',
    expiresAt: null,
  }

  it('süresi geçmiş aktif paketi süresi_doldu gösterir', () => {
    const pkg: ClientPackageForWarning = { ...base, expiresAt: new Date('2020-01-01') }
    expect(resolveDisplayStatus(pkg, new Date('2026-01-01'))).toBe('süresi_doldu')
  })

  it('süresi geçmemiş aktif paketi aktif gösterir', () => {
    const pkg: ClientPackageForWarning = { ...base, expiresAt: new Date('2030-01-01') }
    expect(resolveDisplayStatus(pkg, new Date('2026-01-01'))).toBe('aktif')
  })

  it('iptal/tamamlandı durumunu expiresAt geçmiş olsa bile değiştirmez', () => {
    const pkg: ClientPackageForWarning = { ...base, status: 'iptal', expiresAt: new Date('2020-01-01') }
    expect(resolveDisplayStatus(pkg, new Date('2026-01-01'))).toBe('iptal')
  })
})

describe('isLowSessionWarning', () => {
  it('kalan seans tam 1 ise ve paket aktifse true döner', () => {
    const pkg: ClientPackageForWarning = { sessionCount: 10, sessionsUsed: 9, status: 'aktif', expiresAt: null }
    expect(isLowSessionWarning(pkg)).toBe(true)
  })

  it('kalan seans 2 veya fazlaysa false döner', () => {
    const pkg: ClientPackageForWarning = { sessionCount: 10, sessionsUsed: 8, status: 'aktif', expiresAt: null }
    expect(isLowSessionWarning(pkg)).toBe(false)
  })

  it('kalan seans 0 ise false döner (paket zaten tükenmiş, ayrı bir durum)', () => {
    const pkg: ClientPackageForWarning = { sessionCount: 10, sessionsUsed: 10, status: 'tamamlandı', expiresAt: null }
    expect(isLowSessionWarning(pkg)).toBe(false)
  })

  it('süresi dolmuş bir pakette kalan 1 olsa bile uyarmaz', () => {
    const pkg: ClientPackageForWarning = {
      sessionCount: 10,
      sessionsUsed: 9,
      status: 'aktif',
      expiresAt: new Date('2020-01-01'),
    }
    expect(isLowSessionWarning(pkg, new Date('2026-01-01'))).toBe(false)
  })

  it('iptal edilmiş bir pakette uyarmaz', () => {
    const pkg: ClientPackageForWarning = { sessionCount: 10, sessionsUsed: 9, status: 'iptal', expiresAt: null }
    expect(isLowSessionWarning(pkg)).toBe(false)
  })
})

describe('lowSessionWarningMessage', () => {
  it('danışan adını ve kullanım oranını içerir', () => {
    const pkg: ClientPackageForWarning = { sessionCount: 10, sessionsUsed: 9, status: 'aktif', expiresAt: null }
    expect(lowSessionWarningMessage('Ayşe Yılmaz', pkg)).toContain('Ayşe Yılmaz')
    expect(lowSessionWarningMessage('Ayşe Yılmaz', pkg)).toContain('9/10')
  })
})

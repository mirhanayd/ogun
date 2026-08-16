import { describe, expect, it } from 'vitest'
import { calculateAge } from './client-age'

describe('calculateAge', () => {
  const today = new Date('2026-08-16T12:00:00Z')

  it('birthDate boş/null ise null döner', () => {
    expect(calculateAge(null, today)).toBeNull()
    expect(calculateAge(undefined, today)).toBeNull()
    expect(calculateAge('', today)).toBeNull()
  })

  it('geçersiz bir tarih dizesi için null döner', () => {
    expect(calculateAge('gecersiz-tarih', today)).toBeNull()
  })

  it('gelecekteki bir doğum tarihi için null döner', () => {
    expect(calculateAge('2027-01-01', today)).toBeNull()
  })

  it('doğum günü bu yıl henüz geçmediyse bir yaş eksik sayar', () => {
    // 1990-12-25: bu yılki doğum günü (25 Aralık) 16 Ağustos'tan SONRA.
    expect(calculateAge('1990-12-25', today)).toBe(35)
  })

  it('doğum günü bu yıl zaten geçtiyse tam yaşı sayar', () => {
    // 1990-01-01: bu yılki doğum günü (1 Ocak) 16 Ağustos'tan ÖNCE.
    expect(calculateAge('1990-01-01', today)).toBe(36)
  })

  it('doğum günü tam olarak bugünse yaş o gün artmış sayılır', () => {
    expect(calculateAge('2000-08-16', today)).toBe(26)
  })
})

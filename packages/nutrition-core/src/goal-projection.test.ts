import { describe, expect, it } from 'vitest'
import {
  calculateGoalProgressPercent,
  calculateTrailingSlope,
  checkMeasuredWeeklyLossSafety,
  projectGoalReachDate,
  type TimeSeriesPoint,
} from './goal-projection'

function daysAgo(days: number, from: Date = new Date('2026-08-16T00:00:00Z')): Date {
  return new Date(from.getTime() - days * 24 * 60 * 60 * 1000)
}

describe('calculateTrailingSlope', () => {
  it('doğrusal azalan bir seride haftalık eğimi doğru hesaplar', () => {
    // Günde 0.2 kg kayıp -> haftada 1.4 kg. 28 günlük pencere, 5 nokta.
    const points: TimeSeriesPoint[] = [
      { date: daysAgo(28), value: 95.6 },
      { date: daysAgo(21), value: 94.2 },
      { date: daysAgo(14), value: 92.8 },
      { date: daysAgo(7), value: 91.4 },
      { date: daysAgo(0), value: 90.0 },
    ]
    expect(calculateTrailingSlope(points)).toBeCloseTo(-1.4, 5)
  })

  it('artan bir seride pozitif eğim döner', () => {
    const points: TimeSeriesPoint[] = [
      { date: daysAgo(14), value: 60 },
      { date: daysAgo(0), value: 62 },
    ]
    // 2kg / 14 gün = 0.1428.../gün -> haftada 1kg
    expect(calculateTrailingSlope(points)).toBeCloseTo(1, 5)
  })

  it('pencere dışındaki eski noktaları yok sayar', () => {
    const points: TimeSeriesPoint[] = [
      { date: daysAgo(365), value: 999 }, // aşırı uç değer, pencere dışında kalmalı
      { date: daysAgo(7), value: 80 },
      { date: daysAgo(0), value: 79 },
    ]
    expect(calculateTrailingSlope(points)).toBeCloseTo(-1, 5)
  })

  it('2den az nokta varsa null döner', () => {
    expect(calculateTrailingSlope([{ date: new Date(), value: 80 }])).toBeNull()
    expect(calculateTrailingSlope([])).toBeNull()
  })
})

describe('projectGoalReachDate', () => {
  const asOf = new Date('2026-08-16T00:00:00Z')

  it('doğru yönde ilerleyen bir trend için hedefe varış tarihini hesaplar', () => {
    // 85 -> 80, haftada 1kg kayıp -> 5 hafta = 35 gün.
    const result = projectGoalReachDate(85, 80, -1, asOf)
    expect(result).not.toBeNull()
    const expectedMs = asOf.getTime() + 35 * 24 * 60 * 60 * 1000
    expect(result!.getTime()).toBeCloseTo(expectedMs, -2)
  })

  it('hedeften uzaklaşan bir trend için null döner', () => {
    expect(projectGoalReachDate(85, 90, -1, asOf)).toBeNull()
  })

  it('eğim sıfırsa null döner', () => {
    expect(projectGoalReachDate(85, 80, 0, asOf)).toBeNull()
  })

  it('hedefe zaten ulaşılmışsa şimdiki tarihi döner', () => {
    expect(projectGoalReachDate(80, 80, -1, asOf)).toEqual(asOf)
  })
})

describe('calculateGoalProgressPercent', () => {
  it('başlangıç-hedef arasındaki konumu yüzdeye çevirir', () => {
    expect(calculateGoalProgressPercent(90, 85, 80)).toBeCloseTo(50)
  })

  it('hedefe henüz hiç ilerlenmemişse %0 döner', () => {
    expect(calculateGoalProgressPercent(90, 90, 80)).toBeCloseTo(0)
  })

  it('hedef aşılmışsa %100te sabitler', () => {
    expect(calculateGoalProgressPercent(90, 75, 80)).toBe(100)
  })

  it('yanlış yönde ilerlemeyi %0da sabitler', () => {
    expect(calculateGoalProgressPercent(90, 95, 80)).toBe(0)
  })
})

describe('checkMeasuredWeeklyLossSafety', () => {
  it('haftalık kayıp 1 kg altındaysa uyarı üretmez', () => {
    expect(checkMeasuredWeeklyLossSafety(-0.5)).toEqual([])
  })

  it('haftalık kayıp tam 1 kg ise uyarı üretmez (sınır dahil)', () => {
    expect(checkMeasuredWeeklyLossSafety(-1)).toEqual([])
  })

  it('haftalık kayıp 1 kgı aşarsa danger uyarısı üretir', () => {
    const warnings = checkMeasuredWeeklyLossSafety(-1.5)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]!.severity).toBe('danger')
    expect(warnings[0]!.code).toBe('EXCESSIVE_MEASURED_WEEKLY_LOSS')
  })

  it('kilo alma trendinde (pozitif eğim) uyarı üretmez', () => {
    expect(checkMeasuredWeeklyLossSafety(1.5)).toEqual([])
  })
})

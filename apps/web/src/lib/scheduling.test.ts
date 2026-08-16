import { describe, expect, it } from 'vitest'
import {
  checkWorkingHours,
  computeRescheduleUpdate,
  findConflictingAppointment,
  type AppointmentInterval,
  type HolidayRow,
  type WorkingHourRow,
} from './scheduling'

// GitHub issue #39 / Prompt 7.1 — çakışma kontrolü, çalışma saati dışı
// uyarısı ve sürükle-erteleme payload eşlemesi testleri. dnd-reorder.test.ts
// (GitHub issue #25) ile AYNI desen: gerçek DOM sürükle simülasyonu YOK,
// saf fonksiyon girdi/çıktı testi.

describe('findConflictingAppointment', () => {
  const existing: AppointmentInterval[] = [
    {
      id: 'a1',
      dietitianId: 'd1',
      startsAt: new Date('2026-08-17T10:00:00Z'),
      endsAt: new Date('2026-08-17T10:30:00Z'),
      status: 'planlandı',
    },
  ]

  it('aynı diyetisyenin çakışan aralığını bulur', () => {
    const conflict = findConflictingAppointment(
      {
        dietitianId: 'd1',
        startsAt: new Date('2026-08-17T10:15:00Z'),
        endsAt: new Date('2026-08-17T10:45:00Z'),
      },
      existing,
    )
    expect(conflict?.id).toBe('a1')
  })

  it('farklı diyetisyende çakışma raporlamaz', () => {
    const conflict = findConflictingAppointment(
      {
        dietitianId: 'd2',
        startsAt: new Date('2026-08-17T10:15:00Z'),
        endsAt: new Date('2026-08-17T10:45:00Z'),
      },
      existing,
    )
    expect(conflict).toBeNull()
  })

  it('bitişik (üst üste binmeyen) aralıkları çakışma saymaz', () => {
    const conflict = findConflictingAppointment(
      {
        dietitianId: 'd1',
        startsAt: new Date('2026-08-17T10:30:00Z'),
        endsAt: new Date('2026-08-17T11:00:00Z'),
      },
      existing,
    )
    expect(conflict).toBeNull()
  })

  it('iptal edilmiş randevuyu çakışma saymaz', () => {
    const conflict = findConflictingAppointment(
      {
        dietitianId: 'd1',
        startsAt: new Date('2026-08-17T10:00:00Z'),
        endsAt: new Date('2026-08-17T10:30:00Z'),
      },
      [{ ...existing[0]!, status: 'iptal' }],
    )
    expect(conflict).toBeNull()
  })

  it('kendisini (excludeAppointmentId) çakışma saymaz — erteleme senaryosu', () => {
    const conflict = findConflictingAppointment(
      {
        dietitianId: 'd1',
        startsAt: new Date('2026-08-17T10:00:00Z'),
        endsAt: new Date('2026-08-17T10:30:00Z'),
        excludeAppointmentId: 'a1',
      },
      existing,
    )
    expect(conflict).toBeNull()
  })
})

describe('checkWorkingHours', () => {
  // 2026-08-17 bir Pazartesi (ISO dayOfWeek = 1).
  const workingHours: WorkingHourRow[] = [
    { dayOfWeek: 1, startTime: '09:00', endTime: '17:00', isOpen: true },
    { dayOfWeek: 7, startTime: '09:00', endTime: '17:00', isOpen: false },
  ]
  const holidays: HolidayRow[] = [{ date: '2026-08-20' }]

  it('çalışma saatleri içindeyse uyarı vermez', () => {
    const result = checkWorkingHours(
      new Date('2026-08-17T09:30:00'),
      new Date('2026-08-17T10:00:00'),
      workingHours,
      holidays,
    )
    expect(result).toEqual({ outside: false, reason: null })
  })

  it('çalışma saati BAŞLAMADAN önce uyarır', () => {
    const result = checkWorkingHours(
      new Date('2026-08-17T08:00:00'),
      new Date('2026-08-17T08:30:00'),
      workingHours,
      holidays,
    )
    expect(result).toEqual({ outside: true, reason: 'outside_hours' })
  })

  it('çalışma saati BİTTİKTEN sonra uyarır', () => {
    const result = checkWorkingHours(
      new Date('2026-08-17T17:15:00'),
      new Date('2026-08-17T17:45:00'),
      workingHours,
      holidays,
    )
    expect(result).toEqual({ outside: true, reason: 'outside_hours' })
  })

  it('kapalı gün ise uyarır', () => {
    const result = checkWorkingHours(
      new Date('2026-08-23T10:00:00'), // Pazar (dayOfWeek 7, isOpen false)
      new Date('2026-08-23T10:30:00'),
      workingHours,
      holidays,
    )
    expect(result).toEqual({ outside: true, reason: 'closed_day' })
  })

  it('tanımsız gün ise uyarır', () => {
    const result = checkWorkingHours(
      new Date('2026-08-18T10:00:00'), // Salı — listede yok
      new Date('2026-08-18T10:30:00'),
      workingHours,
      holidays,
    )
    expect(result).toEqual({ outside: true, reason: 'no_working_hours' })
  })

  it('tatil günü ise (çalışma saati uygun olsa bile) uyarır', () => {
    const holidayWorkingHours: WorkingHourRow[] = [
      { dayOfWeek: 4, startTime: '09:00', endTime: '17:00', isOpen: true },
    ]
    const result = checkWorkingHours(
      new Date('2026-08-20T10:00:00'), // Perşembe, tatil listesinde
      new Date('2026-08-20T10:30:00'),
      holidayWorkingHours,
      holidays,
    )
    expect(result).toEqual({ outside: true, reason: 'holiday' })
  })
})

describe('computeRescheduleUpdate', () => {
  it('süreyi koruyarak yeni başlangıç/bitiş üretir', () => {
    const result = computeRescheduleUpdate(
      { startsAt: new Date('2026-08-17T10:00:00Z'), endsAt: new Date('2026-08-17T10:45:00Z') },
      { droppedSlotStart: new Date('2026-08-18T13:00:00Z') },
    )
    expect(result.startsAt).toEqual(new Date('2026-08-18T13:00:00Z'))
    expect(result.endsAt).toEqual(new Date('2026-08-18T13:45:00Z'))
  })

  it('kısa süreli randevuda da 45 dakikalık farkı korur', () => {
    const result = computeRescheduleUpdate(
      { startsAt: new Date('2026-08-17T10:00:00Z'), endsAt: new Date('2026-08-17T10:15:00Z') },
      { droppedSlotStart: new Date('2026-08-17T14:30:00Z') },
    )
    expect(result.endsAt.getTime() - result.startsAt.getTime()).toBe(15 * 60 * 1000)
  })
})

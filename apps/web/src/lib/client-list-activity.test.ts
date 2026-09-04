import { describe, expect, it } from 'vitest'
import { formatLastAppointment, formatLastMeasurement } from './client-list-activity'

describe('shared client list activity formatting', () => {
  it('shows real latest measurement data', () => {
    expect(
      formatLastMeasurement({
        lastMeasurementAt: new Date('2026-08-25T10:00:00+03:00'),
        lastMeasurementWeightKg: '77.20',
      }),
    ).toMatch(/^77,2 kg · 25 Ağu/)
  })

  it('shows real latest appointment data and a dash for missing data', () => {
    expect(
      formatLastAppointment({
        lastAppointmentAt: new Date('2026-08-28T10:00:00+03:00'),
        lastAppointmentStatus: 'geldi',
      }),
    ).toMatch(/^28 Ağu.* · Geldi$/)
    expect(formatLastAppointment({ lastAppointmentAt: null, lastAppointmentStatus: null })).toBe('—')
    expect(formatLastMeasurement({ lastMeasurementAt: null, lastMeasurementWeightKg: null })).toBe('—')
  })
})

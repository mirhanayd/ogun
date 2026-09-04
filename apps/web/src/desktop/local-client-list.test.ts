import { describe, expect, it } from 'vitest'
import { buildLocalClientListRows, localCreatedClientProjection } from './local-client-list'

describe('desktop client list parity', () => {
  it('derives real latest measurement and appointment values locally', () => {
    const [row] = buildLocalClientListRows(
      [{ id: 'client-1', firstName: 'Ada', lastName: 'Demir', createdAt: '2026-01-01' }],
      [
        { id: 'm1', clientId: 'client-1', measuredAt: '2026-08-20T10:00:00Z', weightKg: 78 },
        { id: 'm2', clientId: 'client-1', measuredAt: '2026-08-25T10:00:00Z', weightKg: 77.2 },
      ],
      [
        { id: 'a1', clientId: 'client-1', startsAt: '2026-08-21T10:00:00Z', status: 'planlandı' },
        { id: 'a2', clientId: 'client-1', startsAt: '2026-08-28T10:00:00Z', status: 'geldi' },
      ],
    )
    expect(row).toMatchObject({
      lastMeasurementWeightKg: '77.2',
      lastAppointmentStatus: 'geldi',
    })
    expect(row?.lastMeasurementAt?.toISOString()).toBe('2026-08-25T10:00:00.000Z')
    expect(row?.lastAppointmentAt?.toISOString()).toBe('2026-08-28T10:00:00.000Z')
  })

  it('auto-assigns an offline dietitian-created client only to that dietitian', () => {
    expect(
      localCreatedClientProjection(
        { id: 'client-1' },
        { role: 'dietitian', userId: 'dietitian-1', displayName: 'Dyt. Ada' },
      ),
    ).toMatchObject({
      assignedDietitianId: 'dietitian-1',
      assignedDietitianName: 'Dyt. Ada',
    })
    expect(
      localCreatedClientProjection(
        { id: 'client-2' },
        { role: 'owner', userId: 'owner-1', displayName: 'Owner' },
      ).assignedDietitianId,
    ).toBeNull()
  })
})

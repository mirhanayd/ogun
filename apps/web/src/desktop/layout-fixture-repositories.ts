import type { DomainEntity, OgunRepositories } from '@/data/repositories'

/** In-memory data for the explicit layout-smoke route. Never calls an API or
 * native storage; changes are discarded on reload. */
export function createLayoutFixtureRepositories(failList = false): OgunRepositories {
  const records: Record<string, DomainEntity[]> = {
    clients: [
      {
        id: 'client-1',
        firstName: 'Deniz',
        lastName: 'Yılmaz',
        birthDate: '1992-04-12',
        sex: 'female',
        status: 'aktif',
        phone: '0555 000 00 01',
        email: 'deniz@example.test',
        assignedDietitianId: 'user-1',
        assignedDietitianName: 'Dyt. Ada Demir',
        createdAt: '2026-08-01',
      },
      {
        id: 'client-2',
        firstName: 'Selin',
        lastName: 'Kaya',
        birthDate: '1986-09-21',
        status: 'aktif',
        assignedDietitianId: 'user-2',
        assignedDietitianName: 'Dyt. Ece Kaya',
        createdAt: '2026-08-04',
      },
    ],
    dietitians: [
      { id: 'user-1', name: 'Dyt. Ada Demir' },
      { id: 'user-2', name: 'Dyt. Ece Kaya' },
    ],
    measurements: [
      {
        id: 'm1',
        clientId: 'client-1',
        measuredAt: '2026-08-01T09:00:00Z',
        weightKg: 79,
        heightCm: 170,
        waistCm: 85,
        source: 'manuel',
      },
      {
        id: 'm2',
        clientId: 'client-1',
        measuredAt: '2026-08-25T09:00:00Z',
        weightKg: 77.2,
        heightCm: 170,
        waistCm: 83,
        source: 'manuel',
      },
    ],
    goals: [
      {
        id: 'g1',
        clientId: 'client-1',
        type: 'kilo',
        targetValue: 72,
        startValue: 79,
        startedAt: '2026-08-01',
        status: 'aktif',
      },
    ],
    plans: [
      {
        id: 'plan-1',
        clientId: 'client-1',
        name: 'Dengeli beslenme programı',
        targetKcal: 1800,
        status: 'aktif',
      },
    ],
  }
  const list = async (kind: string) => records[kind] ?? []
  const changed = () => window.dispatchEvent(new Event('ogun-local-data-changed'))
  async function upsert(kind: string, entity: DomainEntity) {
    const rows = records[kind] ?? []
    records[kind] = rows.some((row) => row.id === entity.id)
      ? rows.map((row) => (row.id === entity.id ? { ...row, ...entity } : row))
      : [...rows, entity]
    changed()
  }
  return {
    clients: {
      list: async () => {
        if (failList) throw new Error('Fixture read error')
        return list('clients')
      },
      get: async (id) => (await list('clients')).find((row) => row.id === id) ?? null,
      create: (input) => upsert('clients', input),
      update: (id, patch) => upsert('clients', { ...patch, id }),
      archive: (id) => upsert('clients', { id, status: 'arşiv' }),
      assignDietitian: async (ids, assignedDietitianId) => {
        for (const id of ids) await upsert('clients', { id, assignedDietitianId })
      },
    },
    clinical: {
      listForClient: async (kind, id) => (await list(kind)).filter((row) => row.clientId === id),
      upsert,
    },
    appointments: {
      list: () => list('appointments'),
      upsert: (row) => upsert('appointments', row),
    },
    plans: {
      list: async (id) => (await list('plans')).filter((row) => !id || row.clientId === id),
      get: async (id) => (await list('plans')).find((row) => row.id === id) ?? null,
      upsert: (row) => upsert('plans', row),
      replaceDraft: (id, draft) => upsert('plans', { id, ...draft }),
    },
    foods: { search: async () => [], get: async () => null },
    records: {
      list,
      upsert,
      remove: async (kind, id) => {
        records[kind] = (records[kind] ?? []).filter((row) => row.id !== id)
        changed()
      },
    },
  }
}

import { invoke } from '@tauri-apps/api/core'
import type { DomainEntity, LocalScope, OgunRepositories } from '@/data/repositories'
import { cloudUrl } from '@/lib/cloud-origin'

export type DesktopLocalScope = LocalScope & { capabilities: string[] }

export interface DesktopWorkspacePayload {
  version: number
  capturedAt: string
  scope: { userId: string; clinicId: string; role: LocalScope['role'] }
  clinic: DomainEntity & { name: string; logoUrl?: string | null; primaryColor?: string | null }
  clients?: DomainEntity[]
  anamneses?: DomainEntity[]
  measurements?: DomainEntity[]
  goals?: DomainEntity[]
  labResults?: DomainEntity[]
  payments?: DomainEntity[]
  documents?: DomainEntity[]
  billingPackages?: DomainEntity[]
  clientPackages?: DomainEntity[]
  expenses?: DomainEntity[]
  workingHours?: DomainEntity[]
  plans?: DomainEntity[]
  appointments?: DomainEntity[]
  customFoods?: DomainEntity[]
}

export interface LocalOutboxMutation {
  mutationId: string
  kind: string
  entityType: string
  entityId: string
  operation: string
  payload: Record<string, unknown>
  createdAt: string
  attemptCount: number
  syncStatus: 'pending' | 'failed' | 'syncing' | 'blocked'
  lastError: string | null
}

export interface LocalMutation {
  mutationId?: string
  kind: string
  entityType: string
  entityId: string
  operation: 'create' | 'update' | 'upsert' | 'delete' | 'replace'
  payload: Record<string, unknown>
  projection: DomainEntity
  createdAt?: string
}

const WORKSPACE_DOMAINS = [
  'clients',
  'anamneses',
  'measurements',
  'goals',
  'labResults',
  'payments',
  'documents',
  'billingPackages',
  'clientPackages',
  'expenses',
  'workingHours',
  'plans',
  'appointments',
  'customFoods',
] as const

function entityId(domain: string, entity: DomainEntity): string {
  const candidate = entity.id ?? (domain === 'anamneses' ? entity.clientId : undefined)
  if (typeof candidate !== 'string' || candidate.length === 0) {
    throw new Error(`${domain} kaydının yerel kimliği bulunamadı.`)
  }
  return candidate
}

function entityTimestamp(entity: DomainEntity, capturedAt: string): string {
  for (const key of [
    'updatedAt',
    'createdAt',
    'measuredAt',
    'testedAt',
    'paidAt',
    'startsAt',
  ]) {
    const value = entity[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return capturedAt
}

export function workspaceToLocalDomains(workspace: DesktopWorkspacePayload) {
  const domains: Record<string, Array<{ id: string; payload: DomainEntity; updatedAt: string }>> = {
    clinic: [
      {
        id: entityId('clinic', workspace.clinic),
        payload: workspace.clinic,
        updatedAt: workspace.capturedAt,
      },
    ],
  }

  for (const domain of WORKSPACE_DOMAINS) {
    domains[domain] = (workspace[domain] ?? []).map((entity) => ({
      id: entityId(domain, entity),
      payload: entity,
      updatedAt: entityTimestamp(entity, workspace.capturedAt),
    }))
  }
  return domains
}

export async function replaceLocalWorkspace(
  scope: DesktopLocalScope,
  workspace: DesktopWorkspacePayload,
): Promise<void> {
  await invoke('replace_local_workspace', {
    scope,
    workspace: {
      domains: workspaceToLocalDomains(workspace),
      syncedAt: workspace.capturedAt,
    },
  })
  window.dispatchEvent(new CustomEvent('ogun-local-data-changed', { detail: { source: 'pull' } }))
}

export async function listLocalEntities<T extends DomainEntity>(
  scope: DesktopLocalScope,
  entityType: string,
): Promise<T[]> {
  const rows = await invoke<Array<{ payload: T }>>('list_local_entities', { scope, entityType })
  return rows.map((row) => row.payload)
}

export async function applyLocalMutation(
  scope: DesktopLocalScope,
  mutation: LocalMutation,
): Promise<string> {
  const mutationId = mutation.mutationId ?? crypto.randomUUID()
  await invoke('apply_local_mutation', {
    scope,
    mutation: {
      ...mutation,
      mutationId,
      createdAt: mutation.createdAt ?? new Date().toISOString(),
    },
  })
  window.dispatchEvent(
    new CustomEvent('ogun-local-data-changed', {
      detail: { source: 'mutation', mutationId, entityType: mutation.entityType },
    }),
  )
  return mutationId
}

export const loadLocalOutbox = (scope: DesktopLocalScope, limit = 500) =>
  invoke<LocalOutboxMutation[]>('load_local_outbox', { scope, limit })

export const acknowledgeLocalOutbox = (scope: DesktopLocalScope, mutationIds: string[]) =>
  invoke<void>('acknowledge_local_outbox', { scope, mutationIds })

export const failLocalOutboxMutation = (
  scope: DesktopLocalScope,
  mutationId: string,
  error: string,
) => invoke<void>('fail_local_outbox_mutation', { scope, mutationId, error })

export async function synchronizeLocalFoodCatalog(): Promise<void> {
  const local = await invoke<{ version: string | null; entryCount: number }>('local_food_catalog_info')
  let versionResponse: Response
  try {
    versionResponse = await fetch(cloudUrl('/api/foods/index/version'), { cache: 'no-store' })
  } catch (reason) {
    if (local.entryCount > 0) return
    throw reason
  }
  if (!versionResponse.ok) throw new Error('Besin katalog sürümü alınamadı.')
  const { version } = (await versionResponse.json()) as { version: string }
  if (local.version === version && local.entryCount > 0) return

  let catalogResponse: Response
  try {
    catalogResponse = await fetch(
      cloudUrl(`/api/foods/index?v=${encodeURIComponent(version)}`),
      { cache: 'no-store' },
    )
  } catch (reason) {
    if (local.entryCount > 0) return
    throw reason
  }
  if (!catalogResponse.ok) throw new Error('Besin kataloğu indirilemedi.')
  const catalog = (await catalogResponse.json()) as {
    version: string
    entries: DomainEntity[]
  }
  await invoke('replace_local_food_catalog', {
    catalog: { version: catalog.version, entries: catalog.entries },
  })
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function clientMutationPayload(client: DomainEntity) {
  return {
    clientId: client.id,
    firstName: String(client.firstName ?? ''),
    lastName: String(client.lastName ?? ''),
    birthDate: nullableString(client.birthDate),
    sex: client.sex === 'male' || client.sex === 'female' ? client.sex : null,
    phone: nullableString(client.phone),
    email: nullableString(client.email),
    occupation: nullableString(client.occupation),
    referralSource: nullableString(client.referralSource),
    notes: nullableString(client.notes),
    status: client.status === 'pasif' || client.status === 'arşiv' ? client.status : 'aktif',
  }
}

/** Repository implementation consumed by shared Ogun screens in the packaged renderer. */
export function createNativeRepositories(scope: DesktopLocalScope): OgunRepositories {
  const read = <T extends DomainEntity>(entityType: string) => listLocalEntities<T>(scope, entityType)

  return {
    clients: {
      list: () => read('clients'),
      async get(id) {
        return (await read('clients')).find((client) => client.id === id) ?? null
      },
      async create(input) {
        const now = new Date().toISOString()
        const projection = { ...input, status: 'aktif', createdAt: now, updatedAt: now }
        await applyLocalMutation(scope, {
          kind: 'client.create',
          entityType: 'clients',
          entityId: input.id,
          operation: 'create',
          payload: {
            id: input.id,
            firstName: String(input.firstName ?? ''),
            lastName: String(input.lastName ?? ''),
            birthDate: nullableString(input.birthDate),
            sex: input.sex === 'male' || input.sex === 'female' ? input.sex : null,
            phone: nullableString(input.phone),
            email: nullableString(input.email),
            occupation: nullableString(input.occupation),
            referralSource: nullableString(input.referralSource),
            notes: nullableString(input.notes),
            kvkkConsentChecked: true,
            explicitConsentChecked: true,
          },
          projection,
        })
      },
      async update(id, patch) {
        const current = (await read('clients')).find((client) => client.id === id)
        if (!current) throw new Error('Danışan yerel veritabanında bulunamadı.')
        const projection = { ...current, ...patch, id, updatedAt: new Date().toISOString() }
        await applyLocalMutation(scope, {
          kind: 'client.update',
          entityType: 'clients',
          entityId: id,
          operation: 'update',
          payload: clientMutationPayload(projection),
          projection,
        })
      },
      async archive(id) {
        await this.update(id, { status: 'arşiv' })
      },
    },
    clinical: {
      async listForClient(domain, clientId) {
        return (await read(domain)).filter((entity) => entity.clientId === clientId)
      },
      async upsert(domain, entity) {
        const kind = {
          anamneses: 'anamnesis.upsert',
          measurements: 'measurement.create',
          labResults: 'labResult.create',
          goals: 'goal.create',
        }[domain]
        await applyLocalMutation(scope, {
          kind,
          entityType: domain,
          entityId: entity.id,
          operation: domain === 'anamneses' ? 'upsert' : 'create',
          payload: entity,
          projection: entity,
        })
      },
    },
    plans: {
      list: async (clientId) =>
        (await read('plans')).filter((plan) => !clientId || plan.clientId === clientId),
      async get(id) {
        return (await read('plans')).find((plan) => plan.id === id) ?? null
      },
      async upsert(plan) {
        const existing = (await read('plans')).find((candidate) => candidate.id === plan.id)
        const projection: DomainEntity = {
          ...existing,
          ...plan,
          status:
            plan.status === 'aktif' || plan.status === 'arşiv' ? plan.status : 'taslak',
          updatedAt: new Date().toISOString(),
        }
        await applyLocalMutation(scope, {
          kind: existing ? 'plan.update' : 'plan.create',
          entityType: 'plans',
          entityId: plan.id,
          operation: existing ? 'update' : 'create',
          payload: existing
            ? {
                planId: plan.id,
                name: String(projection.name ?? ''),
                targetKcal: projection.targetKcal ? Number(projection.targetKcal) : null,
                notes: nullableString(projection.notes),
                status: projection.status,
              }
            : {
                id: plan.id,
                clientId: String(plan.clientId ?? ''),
                name: String(plan.name ?? ''),
                targetKcal: plan.targetKcal ? Number(plan.targetKcal) : null,
                notes: nullableString(plan.notes),
                ...(plan.skeleton ? { skeleton: plan.skeleton } : {}),
              },
          projection,
        })
      },
      async replaceDraft(planId, draft) {
        const existing = (await read('plans')).find((plan) => plan.id === planId)
        if (!existing) throw new Error('Plan yerel veritabanında bulunamadı.')
        await applyLocalMutation(scope, {
          kind: 'plan.draft.replace',
          entityType: 'plans',
          entityId: planId,
          operation: 'replace',
          payload: draft,
          projection: { ...existing, draft, updatedAt: new Date().toISOString() },
        })
      },
    },
    appointments: {
      async list(range) {
        return (await read('appointments')).filter((appointment) => {
          const startsAt = String(appointment.startsAt ?? '')
          return (!range?.from || startsAt >= range.from) && (!range?.to || startsAt <= range.to)
        })
      },
      async upsert(appointment) {
        await applyLocalMutation(scope, {
          kind: 'appointment.create',
          entityType: 'appointments',
          entityId: appointment.id,
          operation: 'create',
          payload: appointment,
          projection: appointment,
        })
      },
    },
    foods: {
      async search(query, limit = 20) {
        return invoke<DomainEntity[]>('search_local_foods', { query, limit })
      },
      async get(id) {
        const rows = await invoke<DomainEntity[]>('get_local_food_entries', { ids: [id] })
        return rows[0] ?? null
      },
    },
    records: {
      list: (entityType) => read(entityType),
      async upsert(entityType, entity, kind) {
        await applyLocalMutation(scope, {
          kind,
          entityType,
          entityId: entity.id,
          operation: 'upsert',
          payload: entity,
          projection: entity,
        })
      },
      async remove(entityType, entityId, kind) {
        const existing = (await read(entityType)).find((entity) => entity.id === entityId)
        if (!existing) return
        await applyLocalMutation(scope, {
          kind,
          entityType,
          entityId,
          operation: 'delete',
          payload: { id: entityId },
          projection: existing,
        })
      },
    },
  }
}

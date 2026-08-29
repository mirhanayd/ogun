import { invoke } from '@tauri-apps/api/core'
import type { DomainEntity, LocalScope } from '@/data/repositories'

export type DesktopLocalScope = LocalScope & { capabilities: string[] }

export interface DesktopWorkspacePayload {
  version: number
  capturedAt: string
  clinic: DomainEntity & { name: string }
  clients?: DomainEntity[]
  anamneses?: DomainEntity[]
  measurements?: DomainEntity[]
  goals?: DomainEntity[]
  labResults?: DomainEntity[]
  payments?: DomainEntity[]
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

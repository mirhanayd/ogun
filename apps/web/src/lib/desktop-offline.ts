export interface DesktopOfflineProfile {
  userId: string
  email: string
  displayName: string
  clinicId: string
  clinicName: string
  role: string
  pinConfigured: boolean
  lastSyncedAt: string | null
}

export interface DesktopOfflineMutation {
  id: string
  kind: 'client.create' | 'plan.create' | 'appointment.create' | 'plan.draft.replace'
  payload: Record<string, unknown>
  createdAt: string
}

export interface DesktopSyncResult {
  appliedIds: string[]
  idMap: Record<string, string>
  failedMutationId?: string
  error?: string
}

export function remapOfflineMutation(
  mutation: DesktopOfflineMutation,
  idMap: Record<string, string>,
): DesktopOfflineMutation {
  const payload = { ...mutation.payload }
  for (const key of ['id', 'clientId', 'planId', 'appointmentId']) {
    const value = payload[key]
    if (typeof value === 'string' && idMap[value]) payload[key] = idMap[value]
  }
  return { ...mutation, payload }
}

export function remainingOfflineMutations(
  mutations: DesktopOfflineMutation[],
  result: DesktopSyncResult,
): DesktopOfflineMutation[] {
  const applied = new Set(result.appliedIds)
  return mutations
    .filter((mutation) => !applied.has(mutation.id))
    .map((mutation) => remapOfflineMutation(mutation, result.idMap))
}

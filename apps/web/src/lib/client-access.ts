import type { ListClientsInput } from '@ogun/db/queries'
import type { ClinicMemberRole } from '@ogun/db/schema'

export interface ClientAccessActor {
  userId: string
  role: ClinicMemberRole
}

export function scopeClientListInput(
  input: ListClientsInput,
  actor: ClientAccessActor,
): ListClientsInput {
  return actor.role === 'dietitian' ? { ...input, assignedDietitianId: actor.userId } : input
}

export function canAccessAssignedClient(
  assignedDietitianId: string | null,
  actor: ClientAccessActor,
): boolean {
  return actor.role !== 'dietitian' || assignedDietitianId === actor.userId
}

export function canAccessClientRecord(
  client: { assignedDietitianId: string | null } | null,
  actor: ClientAccessActor,
): boolean {
  return client !== null && canAccessAssignedClient(client.assignedDietitianId, actor)
}

export interface PlanVisibilityPatch {
  clientId?: string | null
  isTemplate?: boolean
  templateCategory?: unknown
}

// Bir danışan planını klinik şablonuna çevirmek, danışana özel içeriği klinik
// genelinde görünür kılabilir. Diyetisyenler planın klinik görünürlük kapsamını
// doğrudan değiştiremez; bunun için içeriği kopyalayan ayrı saveAsTemplate
// akışı kullanılır.
export function containsPlanVisibilityMutation(input: PlanVisibilityPatch): boolean {
  return (
    input.clientId !== undefined ||
    input.isTemplate !== undefined ||
    input.templateCategory !== undefined
  )
}

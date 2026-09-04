import type { ClinicMemberRole } from '@ogun/db/schema'

export function canManuallyAssignDietitian(role: ClinicMemberRole): boolean {
  return role === 'owner'
}

export function assignedDietitianForNewClient(
  role: ClinicMemberRole,
  currentUserId: string,
): string | null {
  return role === 'dietitian' ? currentUserId : null
}

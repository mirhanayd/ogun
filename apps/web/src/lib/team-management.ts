import type { ClinicMemberRole } from '@ogun/db/schema'

export interface ManagedClinicMember {
  userId: string
  role: ClinicMemberRole
}

export function assertCanPromoteClinicMember(
  actorUserId: string,
  member: ManagedClinicMember,
): void {
  if (member.userId === actorUserId) {
    throw new Error('Kendi rolünüzü bu ekrandan değiştiremezsiniz.')
  }
  if (member.role === 'owner') {
    throw new Error('Bu üye zaten yönetici.')
  }
}

export function assertCanRemoveClinicMember(
  actorUserId: string,
  member: ManagedClinicMember,
): void {
  if (member.userId === actorUserId) {
    throw new Error('Kendi üyeliğinizi ekip ekranından silemezsiniz.')
  }
}

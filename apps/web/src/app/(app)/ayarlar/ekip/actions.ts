'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@ogun/db'
import {
  deleteClinicTeamMember,
  getClinicTeamMemberById,
  getClinicById,
  isClinicMemberEmail,
  revokeClinicInvitation,
  updateClinicTeamMemberRole,
  upsertClinicInvitation,
} from '@ogun/db/queries'
import { withAuth } from '@/lib/authz'
import { withAudit } from '@/lib/audit'
import {
  clinicInvitationExpiresAt,
  clinicInvitationUrl,
  createClinicInvitationToken,
  hashClinicInvitationToken,
} from '@/lib/clinic-invitation-token'
import { clinicInvitationEmail } from '@/lib/email/clinic-invitation-template'
import { getEmailSender } from '@/lib/email'
import { assertCanPromoteClinicMember, assertCanRemoveClinicMember } from '@/lib/team-management'
import {
  inviteDietitianSchema,
  type InviteDietitianValues,
} from '@/lib/validation/clinic-invitation-schemas'

export interface TeamActionResult {
  success: boolean
  error?: string
}

const inviteForClinic = withAuth(
  withAudit(
    {
      action: 'create',
      entityType: 'clinic_invitation',
      metadata: ([input]: [InviteDietitianValues]) => ({ email: input.email }),
    },
    async (ctx, input: InviteDietitianValues) => {
      if (await isClinicMemberEmail(db, ctx.scope.clinicId, input.email)) {
        throw new Error('Bu e-posta adresi zaten klinik ekibinde.')
      }

      const clinic = await getClinicById(db, ctx.scope.clinicId)
      if (!clinic) throw new Error('Klinik bulunamadı.')

      const token = createClinicInvitationToken()
      const expiresAt = clinicInvitationExpiresAt()
      await upsertClinicInvitation(db, ctx.scope.clinicId, {
        name: input.name,
        email: input.email,
        tokenHash: hashClinicInvitationToken(token),
        invitedBy: ctx.user.id,
        expiresAt,
      })

      const email = clinicInvitationEmail({
        recipientName: input.name,
        clinicName: clinic.name,
        inviterName: ctx.user.name,
        invitationUrl: clinicInvitationUrl(token),
        expiresAt,
      })
      await getEmailSender().send({ to: input.email, ...email })
    },
  ),
  ['owner'],
)

export async function inviteDietitianAction(
  input: InviteDietitianValues,
): Promise<TeamActionResult> {
  const parsed = inviteDietitianSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Geçersiz bilgi gönderildi.',
    }
  }
  try {
    await inviteForClinic(parsed.data)
    revalidatePath('/ayarlar/ekip')
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Davet gönderilemedi.',
    }
  }
}

const revokeForClinic = withAuth(
  withAudit(
    {
      action: 'update',
      entityType: 'clinic_invitation',
      entityId: ([invitationId]: [string]) => invitationId,
      metadata: () => ({ operation: 'revoke' }),
    },
    async (ctx, invitationId: string) =>
      revokeClinicInvitation(db, ctx.scope.clinicId, invitationId),
  ),
  ['owner'],
)

export async function revokeClinicInvitationAction(
  invitationId: string,
): Promise<TeamActionResult> {
  try {
    const revoked = await revokeForClinic(invitationId)
    if (!revoked) return { success: false, error: 'Aktif davet bulunamadı.' }
    revalidatePath('/ayarlar/ekip')
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Davet iptal edilemedi.',
    }
  }
}

const promoteMemberForClinic = withAuth(
  withAudit(
    {
      action: 'update',
      entityType: 'clinic_member',
      entityId: ([memberId]: [string]) => memberId,
      metadata: () => ({ operation: 'promote_to_owner', role: 'owner' }),
    },
    async (ctx, memberId: string) => {
      const member = await getClinicTeamMemberById(db, ctx.scope.clinicId, memberId)
      if (!member) throw new Error('Ekip üyesi bulunamadı.')
      assertCanPromoteClinicMember(ctx.user.id, member)
      const updated = await updateClinicTeamMemberRole(db, ctx.scope.clinicId, memberId, 'owner')
      if (!updated) throw new Error('Ekip üyesinin rolü güncellenemedi.')
    },
  ),
  ['owner'],
)

export async function promoteClinicMemberAction(memberId: string): Promise<TeamActionResult> {
  try {
    await promoteMemberForClinic(memberId)
    revalidatePath('/ayarlar/ekip')
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Yönetici rolü atanamadı.',
    }
  }
}

const removeMemberForClinic = withAuth(
  withAudit(
    {
      action: 'delete',
      entityType: 'clinic_member',
      entityId: ([memberId]: [string]) => memberId,
      metadata: () => ({ operation: 'remove_from_clinic' }),
    },
    async (ctx, memberId: string) => {
      const member = await getClinicTeamMemberById(db, ctx.scope.clinicId, memberId)
      if (!member) throw new Error('Ekip üyesi bulunamadı.')
      assertCanRemoveClinicMember(ctx.user.id, member)
      const removed = await deleteClinicTeamMember(db, ctx.scope.clinicId, memberId)
      if (!removed) throw new Error('Ekip üyesi silinemedi.')
    },
  ),
  ['owner'],
)

export async function removeClinicMemberAction(memberId: string): Promise<TeamActionResult> {
  try {
    await removeMemberForClinic(memberId)
    revalidatePath('/ayarlar/ekip')
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Ekip üyesi silinemedi.',
    }
  }
}

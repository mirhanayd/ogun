'use server'

import { hashPassword } from 'better-auth/crypto'
import { db } from '@ogun/db'
import { acceptClinicInvitation, getActiveInvitationByTokenHash } from '@ogun/db/queries'
import { hashClinicInvitationToken } from '@/lib/clinic-invitation-token'
import {
  acceptClinicInvitationSchema,
  type AcceptClinicInvitationValues,
} from '@/lib/validation/clinic-invitation-schemas'

export interface AcceptInvitationActionResult {
  success: boolean
  error?: string
  accountCreated?: boolean
}

export async function acceptClinicInvitationAction(
  token: string,
  input?: AcceptClinicInvitationValues,
): Promise<AcceptInvitationActionResult> {
  if (!token || token.length > 256) {
    return { success: false, error: 'Davet bağlantısı geçersiz veya süresi dolmuş.' }
  }

  const tokenHash = hashClinicInvitationToken(token)
  const invitation = await getActiveInvitationByTokenHash(db, tokenHash)
  if (!invitation) {
    return { success: false, error: 'Davet bağlantısı geçersiz, kullanılmış veya süresi dolmuş.' }
  }

  let passwordHash: string | null = null
  if (invitation.requiresPassword) {
    const parsed = acceptClinicInvitationSchema.safeParse(input)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Geçerli bir şifre belirleyin.' }
    }
    passwordHash = await hashPassword(parsed.data.password)
  }

  try {
    const accepted = await acceptClinicInvitation(db, { tokenHash, passwordHash })
    if (!accepted) {
      return { success: false, error: 'Davet bağlantısı daha önce kullanılmış veya süresi dolmuş.' }
    }
    return { success: true, accountCreated: accepted.accountCreated }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Davet kabul edilemedi.',
    }
  }
}

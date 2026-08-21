import type { ClinicMemberRole } from '@ogun/db/schema'

// Better Auth, additionalFields alanlarını varsayılan olarak bazı genel
// oturum güncelleme uçlarında istemci girdisi olarak kabul eder. Klinik ve
// rol güvenlik sınırları yalnızca sunucunun DB üyeliğinden türetilmelidir.
export const AUTH_SESSION_ADDITIONAL_FIELDS = {
  activeClinicId: {
    type: 'string',
    required: false,
    input: false,
  },
  role: {
    type: 'string',
    required: false,
    input: false,
  },
} as const

export interface ActiveClinicSessionFields {
  activeClinicId: string | null | undefined
  role: string | null | undefined
}

export interface TrustedClinicMembership {
  role: ClinicMemberRole
}

export interface ReconciledClinicSession {
  clinicId: string
  role: ClinicMemberRole
  needsSync: boolean
}

// Session içindeki rol hiçbir zaman yetki kaynağı değildir. activeClinicId
// için gerçek üyelik yoksa null döner; üyelik varsa rolü DB kaydından alır ve
// sahte/eski session rolünün düzeltilmesi gerektiğini işaretler.
export function reconcileActiveClinicSession(
  session: ActiveClinicSessionFields,
  membership: TrustedClinicMembership | null,
): ReconciledClinicSession | null {
  if (!session.activeClinicId || !membership) return null
  return {
    clinicId: session.activeClinicId,
    role: membership.role,
    needsSync: session.role !== membership.role,
  }
}

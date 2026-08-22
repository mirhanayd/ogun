import type { ClinicMemberRole } from '@ogun/db/schema'

const ONE_DAY_IN_SECONDS = 60 * 60 * 24

// RFC 6265bis uyumlu tarayıcılar kalıcı cookie'leri en fazla 400 gün
// kabul eder. Daha uzun bir Better Auth expiresIn değeri kullanıcı/account
// satırını oluşturduktan sonra session cookie'si yazılırken isteği 500 ile
// sonlandırır. Günlük kayan yenileme sayesinde aktif kullanıcının oturumu
// bu mutlak sınıra ulaşmadan tekrar ileri taşınır.
export const AUTH_SESSION_EXPIRES_IN_SECONDS = 400 * ONE_DAY_IN_SECONDS
export const AUTH_SESSION_UPDATE_AGE_SECONDS = ONE_DAY_IN_SECONDS

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

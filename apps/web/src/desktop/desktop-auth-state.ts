import type { DesktopOfflineProfile } from '@/lib/desktop-offline'

export type DesktopIdentity = {
  userId: string
  email: string
  displayName: string
  clinicId: string
  clinicName: string
  clinicLogoUrl?: string | null
  clinicPrimaryColor?: string | null
  role: 'owner' | 'dietitian' | 'assistant'
}

export type DesktopAuthState =
  | { phase: 'booting' }
  | { phase: 'login'; profiles: DesktopOfflineProfile[] }
  | { phase: 'pin_setup'; identity: DesktopIdentity }
  | { phase: 'unlocked'; identity: DesktopIdentity }

export function profileIdentity(profile: DesktopOfflineProfile): DesktopIdentity {
  return {
    userId: profile.userId,
    email: profile.email,
    displayName: profile.displayName,
    clinicId: profile.clinicId,
    clinicName: profile.clinicName,
    clinicLogoUrl: profile.clinicLogoUrl ?? null,
    clinicPrimaryColor: profile.clinicPrimaryColor ?? null,
    role: profile.role as DesktopIdentity['role'],
  }
}

/** A saved PIN profile is the process security boundary, independent of connectivity. */
export function stateAfterProfileDetection(
  profiles: DesktopOfflineProfile[],
): DesktopAuthState {
  return { phase: 'login', profiles: profiles.filter((profile) => profile.pinConfigured) }
}

export function stateAfterOnlineSetup(
  identity: DesktopIdentity,
  pinConfigured: boolean,
): DesktopAuthState {
  return pinConfigured
    ? { phase: 'unlocked', identity }
    : { phase: 'pin_setup', identity }
}

export function offlineLoginMessage(savedProfileCount: number): string {
  return savedProfileCount > 0
    ? 'İnternet bağlantısı yok. Bu cihazda daha önce kullandığınız kayıtlı bir hesap varsa PIN ile giriş yapabilirsiniz.'
    : 'Bu cihazda kayıtlı hesap bulunmuyor. İlk giriş için internet bağlantısı gereklidir.'
}

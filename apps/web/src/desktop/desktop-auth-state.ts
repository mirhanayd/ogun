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
  | { phase: 'online_login_required' }
  | { phase: 'locked'; profiles: DesktopOfflineProfile[] }
  | { phase: 'pin_setup'; identity: DesktopIdentity }
  | { phase: 'unlocked'; identity: DesktopIdentity }

export function profileIdentity(profile: DesktopOfflineProfile): DesktopIdentity {
  return {
    userId: profile.userId,
    email: profile.email,
    displayName: profile.displayName,
    clinicId: profile.clinicId,
    clinicName: profile.clinicName,
    role: profile.role as DesktopIdentity['role'],
  }
}

/** A saved PIN profile is the process security boundary, independent of connectivity. */
export function stateAfterProfileDetection(
  profiles: DesktopOfflineProfile[],
): DesktopAuthState {
  const lockedProfiles = profiles.filter((profile) => profile.pinConfigured)
  return lockedProfiles.length > 0
    ? { phase: 'locked', profiles: lockedProfiles }
    : { phase: 'online_login_required' }
}

export function stateAfterOnlineSetup(
  identity: DesktopIdentity,
  pinConfigured: boolean,
): DesktopAuthState {
  return pinConfigured
    ? {
        phase: 'locked',
        profiles: [{ ...identity, pinConfigured: true, lastSyncedAt: null }],
      }
    : { phase: 'pin_setup', identity }
}

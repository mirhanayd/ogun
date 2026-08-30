import { describe, expect, it } from 'vitest'
import type { DesktopOfflineProfile } from '@/lib/desktop-offline'
import {
  profileIdentity,
  stateAfterProfileDetection,
  stateAfterOnlineSetup,
} from './desktop-auth-state'

const savedProfile: DesktopOfflineProfile = {
  userId: 'user-1',
  email: 'ada@example.com',
  displayName: 'Ada Demir',
  clinicId: 'clinic-1',
  clinicName: 'Ada Beslenme',
  role: 'owner',
  pinConfigured: true,
  lastSyncedAt: '2026-08-30T10:00:00.000Z',
}

describe('desktop process auth boundary', () => {
  it('always starts a saved profile locked, independently of token or connectivity state', () => {
    // Token/network are intentionally absent from the decision API: neither can unlock a profile.
    expect(stateAfterProfileDetection([savedProfile])).toEqual({
      phase: 'locked',
      profiles: [savedProfile],
    })
  })

  it('requires online login only when no PIN profile exists', () => {
    expect(stateAfterProfileDetection([])).toEqual({ phase: 'online_login_required' })
  })

  it('does not treat an existing PIN profile as an authenticated online setup', () => {
    const state = stateAfterOnlineSetup(profileIdentity(savedProfile), true)
    expect(state.phase).toBe('locked')
  })

  it('requires PIN creation after first online setup', () => {
    const state = stateAfterOnlineSetup(profileIdentity(savedProfile), false)
    expect(state.phase).toBe('pin_setup')
  })
})

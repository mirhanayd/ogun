import { describe, expect, it } from 'vitest'
import type { DesktopOfflineProfile } from '@/lib/desktop-offline'
import {
  profileIdentity,
  offlineLoginMessage,
  stateAfterProfileDetection,
  stateAfterOnlineSetup,
} from './desktop-auth-state'

const savedProfile: DesktopOfflineProfile = {
  userId: 'user-1',
  email: 'ada@example.com',
  displayName: 'Ada Demir',
  clinicId: 'clinic-1',
  clinicName: 'Ada Beslenme',
  clinicLogoUrl: 'data:image/png;base64,logo',
  clinicPrimaryColor: '#336699',
  role: 'owner',
  pinConfigured: true,
  lastSyncedAt: '2026-08-30T10:00:00.000Z',
}

describe('desktop unified login boundary', () => {
  it('always starts on login and exposes saved PIN profiles as a secondary path', () => {
    expect(stateAfterProfileDetection([savedProfile])).toEqual({
      phase: 'login',
      profiles: [savedProfile],
    })
  })

  it('keeps the same login surface when no PIN profile exists', () => {
    expect(stateAfterProfileDetection([])).toEqual({ phase: 'login', profiles: [] })
  })

  it('enters the workspace only after an existing PIN profile has been unlocked', () => {
    const state = stateAfterOnlineSetup(profileIdentity(savedProfile), true)
    expect(state.phase).toBe('unlocked')
  })

  it('requires PIN creation after first online setup', () => {
    const state = stateAfterOnlineSetup(profileIdentity(savedProfile), false)
    expect(state.phase).toBe('pin_setup')
  })

  it('preserves bootstrap branding in a saved profile identity', () => {
    expect(profileIdentity(savedProfile)).toMatchObject({
      clinicLogoUrl: 'data:image/png;base64,logo',
      clinicPrimaryColor: '#336699',
    })
  })

  it('directs an offline user to saved accounts without hiding normal login', () => {
    expect(offlineLoginMessage(1)).toContain('PIN ile giriş yapabilirsiniz')
  })

  it('explains that first login needs internet when no profile exists', () => {
    expect(offlineLoginMessage(0)).toContain('İlk giriş için internet bağlantısı gereklidir')
  })
})

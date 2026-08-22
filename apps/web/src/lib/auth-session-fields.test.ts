import { describe, expect, it } from 'vitest'
import {
  AUTH_SESSION_ADDITIONAL_FIELDS,
  AUTH_SESSION_EXPIRES_IN_SECONDS,
  AUTH_SESSION_UPDATE_AGE_SECONDS,
  reconcileActiveClinicSession,
} from './auth-session-fields'

const MAX_BROWSER_COOKIE_AGE_SECONDS = 400 * 24 * 60 * 60

describe('session klinik güvenliği', () => {
  it('kalıcı oturum cookie süresi tarayıcının 400 gün sınırını aşmaz', () => {
    expect(AUTH_SESSION_EXPIRES_IN_SECONDS).toBeLessThanOrEqual(
      MAX_BROWSER_COOKIE_AGE_SECONDS,
    )
    expect(AUTH_SESSION_UPDATE_AGE_SECONDS).toBeLessThan(AUTH_SESSION_EXPIRES_IN_SECONDS)
  })

  it('activeClinicId ve role alanlarını istemci yazımına kapatır', () => {
    expect(AUTH_SESSION_ADDITIONAL_FIELDS.activeClinicId.input).toBe(false)
    expect(AUTH_SESSION_ADDITIONAL_FIELDS.role.input).toBe(false)
  })

  it('session içindeki sahte owner rolü yerine DB üyelik rolünü kullanır', () => {
    expect(
      reconcileActiveClinicSession(
        { activeClinicId: 'clinic-1', role: 'owner' },
        { role: 'dietitian' },
      ),
    ).toEqual({ clinicId: 'clinic-1', role: 'dietitian', needsSync: true })
  })

  it('aktif klinikte gerçek üyelik yoksa session seçimini reddeder', () => {
    expect(
      reconcileActiveClinicSession(
        { activeClinicId: 'other-clinic', role: 'owner' },
        null,
      ),
    ).toBeNull()
  })
})

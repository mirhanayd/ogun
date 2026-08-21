import { describe, expect, it } from 'vitest'
import {
  AUTH_SESSION_ADDITIONAL_FIELDS,
  reconcileActiveClinicSession,
} from './auth-session-fields'

describe('session klinik güvenliği', () => {
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

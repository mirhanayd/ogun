import { describe, expect, it } from 'vitest'
import { assertCanPromoteClinicMember, assertCanRemoveClinicMember } from './team-management'

describe('ekip yönetimi güvenlik kuralları', () => {
  it('yönetici başka bir diyetisyeni yönetici yapabilir', () => {
    expect(() =>
      assertCanPromoteClinicMember('owner-1', { userId: 'dietitian-1', role: 'dietitian' }),
    ).not.toThrow()
  })

  it('zaten yönetici olan üyeyi yeniden yükseltmez', () => {
    expect(() =>
      assertCanPromoteClinicMember('owner-1', { userId: 'owner-2', role: 'owner' }),
    ).toThrow('Bu üye zaten yönetici.')
  })

  it('yönetici kendi rolünü değiştiremez', () => {
    expect(() =>
      assertCanPromoteClinicMember('owner-1', { userId: 'owner-1', role: 'owner' }),
    ).toThrow('Kendi rolünüzü')
  })

  it('yönetici başka üyeyi silebilir ama kendi üyeliğini silemez', () => {
    expect(() =>
      assertCanRemoveClinicMember('owner-1', { userId: 'dietitian-1', role: 'dietitian' }),
    ).not.toThrow()
    expect(() =>
      assertCanRemoveClinicMember('owner-1', { userId: 'owner-1', role: 'owner' }),
    ).toThrow('Kendi üyeliğinizi')
  })
})

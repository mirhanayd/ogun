import { describe, expect, it } from 'vitest'
import {
  ClientConsentIncompleteError,
  assertClientConsentComplete,
  clientConsentSchema,
  isClientConsentComplete,
} from './client-schemas'

describe('clientConsentSchema', () => {
  it('kvkkConsentVersion boş bırakılamaz', () => {
    const result = clientConsentSchema.safeParse({
      kvkkConsentAt: new Date(),
      kvkkConsentVersion: '',
      explicitConsentAt: new Date(),
    })
    expect(result.success).toBe(false)
  })

  it('marketingConsentAt olmadan da geçerlidir (ayrı ve opsiyonel)', () => {
    const result = clientConsentSchema.safeParse({
      kvkkConsentAt: new Date(),
      kvkkConsentVersion: '2026-01',
      explicitConsentAt: new Date(),
    })
    expect(result.success).toBe(true)
  })
})

describe('isClientConsentComplete / assertClientConsentComplete', () => {
  it('kvkkConsentAt VE explicitConsentAt ikisi de doluysa tamamlanmış sayılır', () => {
    expect(
      isClientConsentComplete({ kvkkConsentAt: new Date(), explicitConsentAt: new Date() }),
    ).toBe(true)
  })

  it('sadece genel KVKK onayı varken (özel nitelikli veri rızası eksikken) TAMAMLANMAMIŞ sayılır', () => {
    // Bu, iki rıza türünün BİLEREK ayrı tutulduğunun testi: genel KVKK onayı
    // tek başına özel nitelikli veri (sağlık) işlemek için yeterli değildir.
    expect(isClientConsentComplete({ kvkkConsentAt: new Date(), explicitConsentAt: null })).toBe(false)
  })

  it('sadece özel nitelikli veri rızası varken (genel KVKK onayı eksikken) TAMAMLANMAMIŞ sayılır', () => {
    expect(isClientConsentComplete({ kvkkConsentAt: null, explicitConsentAt: new Date() })).toBe(false)
  })

  it('hiçbir rıza yokken TAMAMLANMAMIŞ sayılır', () => {
    expect(isClientConsentComplete({ kvkkConsentAt: null, explicitConsentAt: null })).toBe(false)
  })

  it('assertClientConsentComplete rıza eksikken ClientConsentIncompleteError fırlatır', () => {
    expect(() => assertClientConsentComplete({ kvkkConsentAt: null, explicitConsentAt: null })).toThrow(
      ClientConsentIncompleteError,
    )
  })

  it('assertClientConsentComplete rıza tamamsa hata fırlatmaz', () => {
    expect(() =>
      assertClientConsentComplete({ kvkkConsentAt: new Date(), explicitConsentAt: new Date() }),
    ).not.toThrow()
  })
})

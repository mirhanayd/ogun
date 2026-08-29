import { describe, expect, it } from 'vitest'
import { MAX_LOGO_BYTES } from './onboarding-schemas'
import { clinicIdentitySchema, normalizeClinicIdentity } from './clinic-identity-schemas'

const completeIdentity = {
  name: ' Ogun Nutrition Clinic ',
  phone: ' +90 212 555 00 00 ',
  address: ' Nisantasi, Istanbul ',
  taxId: ' 1234567890 ',
  logoUrl: 'https://cdn.example.com/clinic-logo.webp',
  primaryColor: '#A1B2C3',
}

describe('clinicIdentitySchema', () => {
  it('loads and normalizes every editable identity field together', () => {
    const parsed = clinicIdentitySchema.parse(completeIdentity)

    expect(normalizeClinicIdentity(parsed)).toEqual({
      name: 'Ogun Nutrition Clinic',
      phone: '+90 212 555 00 00',
      address: 'Nisantasi, Istanbul',
      taxId: '1234567890',
      logoUrl: 'https://cdn.example.com/clinic-logo.webp',
      primaryColor: '#a1b2c3',
    })
  })

  it('normalizes empty optional fields to canonical null values', () => {
    const parsed = clinicIdentitySchema.parse({
      name: 'Clinic',
      phone: '',
      address: '',
      taxId: '',
      logoUrl: '',
      primaryColor: '',
    })

    expect(normalizeClinicIdentity(parsed)).toEqual({
      name: 'Clinic',
      phone: null,
      address: null,
      taxId: null,
      logoUrl: null,
      primaryColor: null,
    })
  })

  it('rejects invalid and CSS-injectable color values', () => {
    expect(
      clinicIdentitySchema.safeParse({ ...completeIdentity, primaryColor: '#12345' }).success,
    ).toBe(false)
    expect(
      clinicIdentitySchema.safeParse({
        ...completeIdentity,
        primaryColor: 'red; background:url(javascript:alert(1))',
      }).success,
    ).toBe(false)
  })

  it('accepts only HTTPS or supported data image logos', () => {
    expect(
      clinicIdentitySchema.safeParse({
        ...completeIdentity,
        logoUrl: 'data:image/png;base64,aGVsbG8=',
      }).success,
    ).toBe(true)
    expect(
      clinicIdentitySchema.safeParse({
        ...completeIdentity,
        logoUrl: 'http://example.com/logo.png',
      }).success,
    ).toBe(false)
    expect(
      clinicIdentitySchema.safeParse({ ...completeIdentity, logoUrl: 'javascript:alert(1)' })
        .success,
    ).toBe(false)
  })

  it('rejects a data image logo over the 500 KB limit', () => {
    const oversizedLogo = `data:image/png;base64,${'A'.repeat(Math.ceil(MAX_LOGO_BYTES * 1.4) + 1)}`
    expect(
      clinicIdentitySchema.safeParse({ ...completeIdentity, logoUrl: oversizedLogo }).success,
    ).toBe(false)
  })

  it('requires a clinic name', () => {
    expect(clinicIdentitySchema.safeParse({ ...completeIdentity, name: ' ' }).success).toBe(false)
  })
})

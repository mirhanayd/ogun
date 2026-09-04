import { describe, expect, it } from 'vitest'
import { clinicIdentityFromEntity } from './local-branding'

describe('desktop local clinic identity', () => {
  it('restores a saved primary color after a component/app remount', () => {
    const localClinic = { id: 'clinic-1', name: 'Ada Klinik', primaryColor: '#336699' }
    expect(clinicIdentityFromEntity(localClinic, localClinic).primaryColor).toBe('#336699')
    expect(clinicIdentityFromEntity({ ...localClinic }, localClinic).primaryColor).toBe('#336699')
  })

  it('keeps data URI and HTTPS logos renderable from the workspace entity', () => {
    const fallback = { id: 'clinic-1', name: 'Ada Klinik' }
    expect(
      clinicIdentityFromEntity(
        { ...fallback, logoUrl: 'data:image/png;base64,cHJldmlldw==' },
        fallback,
      ).logoUrl,
    ).toBe('data:image/png;base64,cHJldmlldw==')
    expect(
      clinicIdentityFromEntity(
        { ...fallback, logoUrl: 'https://cdn.example.com/clinic.png' },
        fallback,
      ).logoUrl,
    ).toBe('https://cdn.example.com/clinic.png')
  })

  it('does not let an invalid cloud color replace canonical local branding', () => {
    expect(
      clinicIdentityFromEntity(
        { id: 'clinic-1', name: 'Ada Klinik', primaryColor: 'green' },
        { id: 'clinic-1', name: 'Ada Klinik' },
      ).primaryColor,
    ).toBeNull()
  })
})

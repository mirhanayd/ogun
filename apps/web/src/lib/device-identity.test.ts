import { describe, expect, it } from 'vitest'
import { hashInstallationId, resolveInstallationAccess } from './device-identity'

describe('desktop device identity', () => {
  it('hashes a high entropy installation ID deterministically without returning raw input', () => {
    const raw = 'a'.repeat(64)
    const hash = hashInstallationId(raw)
    expect(hash).toHaveLength(64)
    expect(hash).not.toBe(raw)
    expect(hashInstallationId(raw)).toBe(hash)
  })

  it('rejects malformed identifiers instead of hardware fingerprints', () => {
    expect(() => hashInstallationId('00:11:22:33:44:55')).toThrow('Geçersiz')
  })

  it('leaves browser auth untouched and denies only a revoked desktop installation', async () => {
    let lookups = 0
    const lookup = async () => { lookups += 1; return 'revoked' as const }
    await expect(resolveInstallationAccess(null, lookup)).resolves.toBe('browser')
    expect(lookups).toBe(0)
    await expect(resolveInstallationAccess('b'.repeat(64), lookup)).resolves.toBe('revoked')
    expect(lookups).toBe(1)
  })
})

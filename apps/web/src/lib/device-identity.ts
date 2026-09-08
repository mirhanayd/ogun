import { createHash } from 'node:crypto'

const INSTALLATION_ID_PATTERN = /^[a-f0-9]{64}$/i

export function hashInstallationId(rawInstallationId: string) {
  if (!INSTALLATION_ID_PATTERN.test(rawInstallationId)) throw new Error('Geçersiz Ogun installation ID.')
  return createHash('sha256').update(rawInstallationId, 'utf8').digest('hex')
}

export async function resolveInstallationAccess(
  rawInstallationId: string | null,
  statusLookup: (installationIdHash: string) => Promise<'active' | 'revoked' | null>,
) {
  if (!rawInstallationId) return 'browser' as const
  return (await statusLookup(hashInstallationId(rawInstallationId))) === 'revoked' ? 'revoked' as const : 'active' as const
}

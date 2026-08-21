import 'server-only'
import { createHash, randomBytes } from 'node:crypto'

export const CLINIC_INVITATION_TTL_DAYS = 7

export function createClinicInvitationToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashClinicInvitationToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function clinicInvitationExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + CLINIC_INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000)
}

export function clinicInvitationUrl(token: string): string {
  const configuredBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL
  if (!configuredBaseUrl) {
    throw new Error('NEXT_PUBLIC_APP_URL veya BETTER_AUTH_URL tanımlı değil; davet bağlantısı oluşturulamadı.')
  }
  return new URL(`/davet/${encodeURIComponent(token)}`, configuredBaseUrl).toString()
}

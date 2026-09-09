import { createHash, randomBytes } from 'node:crypto'

export const CLINICAL_REVIEWER_INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1_000
export const CLINICAL_REVIEWER_INVITATION_RESEND_COOLDOWN_MS = 60 * 1_000

export function normalizeClinicalReviewerEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function createClinicalReviewerInvitationToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashClinicalReviewerInvitationToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function clinicalReviewerInvitationExpiry(now = new Date()): Date {
  return new Date(now.getTime() + CLINICAL_REVIEWER_INVITATION_TTL_MS)
}

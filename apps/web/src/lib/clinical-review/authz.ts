import 'server-only'
import { notFound, redirect } from 'next/navigation'
import { db } from '@ogun/db'
import {
  getClinicalReviewerWithCapabilities,
  type ClinicalProfessionalRole,
  type ClinicalReviewerCapability,
  type ClinicalReviewerVerificationStatus,
} from '@ogun/db/queries'
import {
  isReviewerEligibleToReview,
  type ClinicalReviewerContext,
} from '@ogun/etl/clinical-review-policy'
import { requireAuth, UnauthenticatedError } from '../authz'

export class ClinicalReviewDisabledError extends Error {
  constructor(message = 'Klinik İnceleme Portalı bu ortamda devre dışı bırakılmıştır.') {
    super(message)
    this.name = 'ClinicalReviewDisabledError'
  }
}

export class NotClinicalReviewerError extends Error {
  constructor(
    message = 'Klinik İnceleme Portalı için yetkilendirilmiş bir hakem profiliniz bulunmuyor.',
  ) {
    super(message)
    this.name = 'NotClinicalReviewerError'
  }
}

export class UnverifiedReviewerError extends Error {
  constructor(
    message = 'Klinik hakem profiliniz henüz doğrulanmamıştır (durum: Beklemede veya Reddedildi).',
  ) {
    super(message)
    this.name = 'UnverifiedReviewerError'
  }
}

export class InactiveReviewerError extends Error {
  constructor(message = 'Klinik hakem profiliniz askıya alınmış veya pasif durumdadır.') {
    super(message)
    this.name = 'InactiveReviewerError'
  }
}

export class ClinicalAdminRequiredError extends Error {
  constructor(message = 'Bu işlem için Klinik Yönetici (clinical_admin) yetkisi gereklidir.') {
    super(message)
    this.name = 'ClinicalAdminRequiredError'
  }
}

export class ClinicalPublisherRequiredError extends Error {
  constructor(message = 'Bu işlem için yayınlama yetkisi (can_publish) gereklidir.') {
    super(message)
    this.name = 'ClinicalPublisherRequiredError'
  }
}

export class IneligibleReviewerError extends Error {
  constructor(
    message = 'Bu adayın incelemesi için uzmanlık veya rol gereksiniminiz uygun değildir.',
  ) {
    super(message)
    this.name = 'IneligibleReviewerError'
  }
}

/**
 * Checks if the clinical review portal feature is enabled via environment variables.
 * If explicitly set to 'false', fails closed by returning 404 (not found).
 */
export function assertClinicalReviewEnabled(): void {
  if (process.env.CLINICAL_REVIEW_ENABLED === 'false') {
    notFound()
  }
}

export interface ReviewerAuthSession {
  user: {
    id: string
    email: string
    name: string
  }
  profile: {
    userId: string
    professionalRole: ClinicalProfessionalRole
    specialty: string | null
    verificationStatus: ClinicalReviewerVerificationStatus
    verifiedAt: Date | null
    verifiedBy: string | null
    isActive: boolean
    canPublish: boolean
    createdAt: Date
    updatedAt: Date
  }
  capabilities: readonly ClinicalReviewerCapability[]
  reviewerContext: ClinicalReviewerContext
}

/**
 * Ensures the user is logged in, portal is enabled, and a clinical reviewer profile exists.
 * Profile may be pending verification (e.g. to show status banner).
 */
export async function requireReviewer(): Promise<ReviewerAuthSession> {
  assertClinicalReviewEnabled()
  let authSession
  try {
    authSession = await requireAuth()
  } catch (error) {
    if (error instanceof UnauthenticatedError) redirect('/giris?next=/clinical-review')
    throw error
  }

  const profileWithCaps = await getClinicalReviewerWithCapabilities(db, authSession.user.id)
  if (!profileWithCaps) {
    throw new NotClinicalReviewerError()
  }

  const reviewerContext: ClinicalReviewerContext = {
    userId: profileWithCaps.userId,
    role: profileWithCaps.professionalRole as ClinicalProfessionalRole,
    specialty: profileWithCaps.specialty,
    verificationStatus: profileWithCaps.verificationStatus as ClinicalReviewerVerificationStatus,
    isActive: profileWithCaps.isActive,
    canPublish: profileWithCaps.canPublish,
    capabilities: profileWithCaps.capabilities,
  }

  return {
    user: authSession.user,
    profile: {
      ...profileWithCaps,
      professionalRole: profileWithCaps.professionalRole as ClinicalProfessionalRole,
      verificationStatus: profileWithCaps.verificationStatus as ClinicalReviewerVerificationStatus,
    },
    capabilities: profileWithCaps.capabilities,
    reviewerContext,
  }
}

/**
 * Enforces that the reviewer is verified and actively authorized to submit clinical decisions.
 */
export async function requireVerifiedReviewer(): Promise<ReviewerAuthSession> {
  const session = await requireReviewer()

  if (session.profile.verificationStatus !== 'verified') {
    throw new UnverifiedReviewerError()
  }

  if (!session.profile.isActive) {
    throw new InactiveReviewerError()
  }

  if (!isReviewerEligibleToReview(session.reviewerContext)) {
    throw new InactiveReviewerError('Reviewer is not eligible to review.')
  }

  return session
}

/**
 * Enforces clinical admin privileges.
 */
export async function requireClinicalAdmin(): Promise<ReviewerAuthSession> {
  const session = await requireVerifiedReviewer()

  if (session.profile.professionalRole !== 'clinical_admin') {
    throw new ClinicalAdminRequiredError()
  }

  return session
}

/**
 * Enforces clinical admin privileges with explicit publishing permission (can_publish = true).
 */
export async function requirePublisherAdmin(): Promise<ReviewerAuthSession> {
  const session = await requireClinicalAdmin()

  if (!session.profile.canPublish) {
    throw new ClinicalPublisherRequiredError()
  }

  return session
}

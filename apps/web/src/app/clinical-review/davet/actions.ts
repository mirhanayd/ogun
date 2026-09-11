'use server'

import { db } from '@ogun/db'
import { acceptReviewerInvitation, type ClinicalTaskEligibilityValidator } from '@ogun/db/queries'
import { hashClinicalReviewerInvitationToken } from '@ogun/db/clinical-reviewer-invitation'
import {
  isClinicalReviewTaskAssignable,
  isReviewerEligibleForTask,
} from '@ogun/etl/clinical-review-policy'
import { requireAuth } from '@/lib/authz'
import { enforceUserRateLimit } from '@/lib/abuse-rate-limit'

export async function acceptClinicalReviewerInvitationAction(token: string) {
  if (!token || token.length > 256) return { success: false, error: 'Davet bağlantısı geçersiz.' }
  try {
    const session = await requireAuth()
    await enforceUserRateLimit('reviewer-invitation-accept', session.user.id, { max: 10, windowSeconds: 600 })
    const validate: ClinicalTaskEligibilityValidator = (task, assignmentRole, reviewer) => {
      if (!reviewer || !isClinicalReviewTaskAssignable(task.status))
        return { eligible: false, reason: `Görev ${task.status} durumunda yeni atamaya kapalı.` }
      return isReviewerEligibleForTask(
        {
          userId: session.user.id,
          role: reviewer.professionalRole,
          verificationStatus: 'verified',
          isActive: true,
          canPublish: false,
          capabilities: reviewer.capabilities,
        },
        task,
        assignmentRole === 'primary' ? 'primary' : 'co_review',
      )
    }
    const result = await acceptReviewerInvitation(db, {
      tokenHash: hashClinicalReviewerInvitationToken(token),
      userId: session.user.id,
      userEmail: session.user.email,
      validate,
    })
    return { success: true, data: result }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Davet kabul edilemedi.',
    }
  }
}

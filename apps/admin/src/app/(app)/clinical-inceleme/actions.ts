'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { db } from '@ogun/db'
import {
  ClinicalReviewerOperationError,
  assignTaskToReviewerForPlatform,
  cancelReviewerAssignmentForPlatform,
  cancelReviewerInvitationAssignmentForPlatform,
  createReviewerInvitationForPlatform,
  getReviewerForPlatform,
  getReviewerInvitationForPlatform,
  recordReviewerInvitationEmailResult,
  revokeReviewerInvitationForPlatform,
  rotateReviewerInvitationTokenForPlatform,
  stageReviewerInvitationAssignmentsForPlatform,
  transitionReviewerStatusForPlatform,
  updateReviewerCapabilitiesForPlatform,
  updateReviewerInvitationCapabilitiesForPlatform,
  type ClinicalAssignmentRole,
  type ClinicalProfessionalRole,
  type ClinicalReviewerCapability,
  type ClinicalReviewerVerificationStatus,
} from '@ogun/db/queries'
import {
  CLINICAL_REVIEWER_INVITATION_RESEND_COOLDOWN_MS,
  clinicalReviewerInvitationExpiry,
  createClinicalReviewerInvitationToken,
  hashClinicalReviewerInvitationToken,
} from '@ogun/db/clinical-reviewer-invitation'
import { requirePlatformPermission } from '@/lib/platform-authz'
import { getPlatformRequestMetadata } from '@/lib/platform-audit'
import {
  sendClinicalReviewerInvitationEmail,
  sendClinicalReviewerVerificationEmail,
} from '@/lib/clinical-reviewer-email'
import {
  CLINICAL_ASSIGNMENT_ROLES,
  CLINICAL_PROFESSIONAL_ROLES,
  CLINICAL_REVIEWER_CAPABILITIES,
  PROFESSIONAL_ROLE_LABELS,
  clinicalTaskValidator,
} from '@/lib/clinical-review-model'

function field(formData: FormData, name: string) {
  const value = formData.get(name)
  return typeof value === 'string' ? value.trim() : ''
}
function selectedCapabilities(formData: FormData) {
  const values = formData
    .getAll('capabilities')
    .filter((value): value is string => typeof value === 'string')
  return [...new Set(values)].filter((value): value is ClinicalReviewerCapability =>
    CLINICAL_REVIEWER_CAPABILITIES.includes(value as ClinicalReviewerCapability),
  )
}
function withMessage(path: string, key: 'mesaj' | 'hata', message: string) {
  const url = new URL(path, 'http://admin.local')
  url.searchParams.set(key, message)
  return `${url.pathname}${url.search}`
}
function webInvitationUrl(token: string) {
  const origin = process.env.OGUN_WEB_URL
  if (!origin) throw new Error('OGUN_WEB_URL tanımlı değil.')
  const url = new URL('/clinical-review/davet', origin)
  url.searchParams.set('token', token)
  return url.toString()
}

function webAssignedReviewsUrl() {
  const origin = process.env.OGUN_WEB_URL
  if (!origin) throw new Error('OGUN_WEB_URL tanımlı değil.')
  return new URL('/clinical-review/assigned', origin).toString()
}

export async function createReviewerInvitationAction(formData: FormData) {
  const ctx = await requirePlatformPermission('clinical.reviewers.manage')
  const role = field(formData, 'professionalRole') as ClinicalProfessionalRole
  const capabilities = selectedCapabilities(formData)
  const name = field(formData, 'name')
  const email = field(formData, 'email')
  const specialty = field(formData, 'specialty')
  if (!CLINICAL_PROFESSIONAL_ROLES.includes(role))
    redirect(withMessage('/clinical-inceleme/davetler/yeni', 'hata', 'Geçerli bir meslek seçin.'))
  if (!name || !email || capabilities.length === 0)
    redirect(
      withMessage(
        '/clinical-inceleme/davetler/yeni',
        'hata',
        'Ad, e-posta ve en az bir yetkinlik zorunludur.',
      ),
    )
  if (
    name.length > 200 ||
    specialty.length > 200 ||
    email.length > 320 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  )
    redirect(
      withMessage('/clinical-inceleme/davetler/yeni', 'hata', 'Davet bilgileri geçerli değil.'),
    )
  const token = createClinicalReviewerInvitationToken()
  const now = new Date()
  const request = await getPlatformRequestMetadata()
  let invitation
  try {
    invitation = await createReviewerInvitationForPlatform(db, {
      name,
      email,
      professionalRole: role,
      specialty: specialty || null,
      capabilities,
      professionalVerificationConfirmed:
        field(formData, 'professionalVerificationConfirmed') === 'on',
      tokenHash: hashClinicalReviewerInvitationToken(token),
      expiresAt: clinicalReviewerInvitationExpiry(now),
      actorUserId: ctx.user.id,
      platformStaffId: ctx.staff.id,
      ...request,
      now,
    })
  } catch (error) {
    if (error instanceof ClinicalReviewerOperationError && error.relatedId) {
      if (error.code === 'reviewer_exists')
        redirect(`/clinical-inceleme/hakemler/${error.relatedId}`)
      if (error.code === 'duplicate_invitation')
        redirect(`/clinical-inceleme/davetler/${error.relatedId}`)
    }
    redirect(
      withMessage(
        '/clinical-inceleme/davetler/yeni',
        'hata',
        error instanceof Error ? error.message : 'Davet oluşturulamadı.',
      ),
    )
  }
  let message = 'Davet oluşturuldu ve e-posta gönderildi.'
  try {
    await sendClinicalReviewerInvitationEmail({
      email: invitation.email,
      name: invitation.name,
      professionalRole:
        PROFESSIONAL_ROLE_LABELS[invitation.professionalRole as ClinicalProfessionalRole],
      specialty: invitation.specialty,
      invitationUrl: webInvitationUrl(token),
      expiresAt: invitation.expiresAt,
    })
    await recordReviewerInvitationEmailResult(db, invitation.id, { sent: true })
  } catch (error) {
    await recordReviewerInvitationEmailResult(db, invitation.id, {
      sent: false,
      error: error instanceof Error ? error.message : 'Bilinmeyen e-posta hatası',
    })
    message = 'Davet oluşturuldu ancak e-posta gönderilemedi; detaydan yeniden deneyin.'
  }
  revalidatePath('/clinical-inceleme')
  redirect(withMessage(`/clinical-inceleme/davetler/${invitation.id}`, 'mesaj', message))
}

export async function resendReviewerInvitationAction(formData: FormData) {
  const ctx = await requirePlatformPermission('clinical.reviewers.manage')
  const invitationId = field(formData, 'invitationId')
  const token = createClinicalReviewerInvitationToken()
  const now = new Date()
  const request = await getPlatformRequestMetadata()
  let invitation
  try {
    invitation = await rotateReviewerInvitationTokenForPlatform(db, {
      invitationId,
      tokenHash: hashClinicalReviewerInvitationToken(token),
      expiresAt: clinicalReviewerInvitationExpiry(now),
      cooldownMs: CLINICAL_REVIEWER_INVITATION_RESEND_COOLDOWN_MS,
      actorUserId: ctx.user.id,
      platformStaffId: ctx.staff.id,
      ...request,
      now,
    })
  } catch (error) {
    redirect(
      withMessage(
        `/clinical-inceleme/davetler/${invitationId}`,
        'hata',
        error instanceof Error ? error.message : 'Davet gönderilemedi.',
      ),
    )
  }
  let message = 'Yeni davet bağlantısı gönderildi; önceki bağlantı geçersizdir.'
  try {
    await sendClinicalReviewerInvitationEmail({
      email: invitation.email,
      name: invitation.name,
      professionalRole:
        PROFESSIONAL_ROLE_LABELS[invitation.professionalRole as ClinicalProfessionalRole],
      specialty: invitation.specialty,
      invitationUrl: webInvitationUrl(token),
      expiresAt: invitation.expiresAt,
    })
    await recordReviewerInvitationEmailResult(db, invitation.id, { sent: true })
  } catch (error) {
    await recordReviewerInvitationEmailResult(db, invitation.id, {
      sent: false,
      error: error instanceof Error ? error.message : 'Bilinmeyen e-posta hatası',
    })
    message = 'Token yenilendi ancak e-posta gönderilemedi.'
  }
  revalidatePath(`/clinical-inceleme/davetler/${invitationId}`)
  redirect(withMessage(`/clinical-inceleme/davetler/${invitationId}`, 'mesaj', message))
}

export async function revokeReviewerInvitationAction(formData: FormData) {
  const ctx = await requirePlatformPermission('clinical.reviewers.manage')
  const invitationId = field(formData, 'invitationId')
  const request = await getPlatformRequestMetadata()
  try {
    await revokeReviewerInvitationForPlatform(db, {
      invitationId,
      reason: field(formData, 'reason'),
      actorUserId: ctx.user.id,
      platformStaffId: ctx.staff.id,
      ...request,
    })
  } catch (error) {
    redirect(
      withMessage(
        `/clinical-inceleme/davetler/${invitationId}`,
        'hata',
        error instanceof Error ? error.message : 'Davet iptal edilemedi.',
      ),
    )
  }
  revalidatePath('/clinical-inceleme')
  redirect(
    withMessage(`/clinical-inceleme/davetler/${invitationId}`, 'mesaj', 'Davet iptal edildi.'),
  )
}

export async function updateInvitationCapabilitiesAction(formData: FormData) {
  const ctx = await requirePlatformPermission('clinical.reviewers.manage')
  const invitationId = field(formData, 'invitationId')
  const invitation = await getReviewerInvitationForPlatform(db, invitationId)
  if (!invitation) redirect('/clinical-inceleme/davetler')
  const capabilities = selectedCapabilities(formData)
  const request = await getPlatformRequestMetadata()
  let invalidatedCount = 0
  try {
    const result = await updateReviewerInvitationCapabilitiesForPlatform(db, {
      invitationId,
      capabilities,
      actorUserId: ctx.user.id,
      platformStaffId: ctx.staff.id,
      validate: clinicalTaskValidator(
        invitation.professionalRole as ClinicalProfessionalRole,
        capabilities,
      ),
      ...request,
    })
    invalidatedCount = result.invalidatedCount
  } catch (error) {
    redirect(
      withMessage(
        `/clinical-inceleme/davetler/${invitationId}`,
        'hata',
        error instanceof Error ? error.message : 'Yetkinlikler güncellenemedi.',
      ),
    )
  }
  revalidatePath(`/clinical-inceleme/davetler/${invitationId}`)
  redirect(
    withMessage(
      `/clinical-inceleme/davetler/${invitationId}`,
      'mesaj',
      `Yetkinlikler güncellendi; ${invalidatedCount} görev ayırma kaydı geçersizleştirildi.`,
    ),
  )
}

export async function stageInvitationTasksAction(formData: FormData) {
  const ctx = await requirePlatformPermission('clinical.tasks.assign')
  const invitationId = field(formData, 'invitationId')
  const invitation = await getReviewerInvitationForPlatform(db, invitationId)
  if (!invitation) redirect('/clinical-inceleme/davetler')
  const assignmentRole = field(formData, 'assignmentRole') as ClinicalAssignmentRole
  const role = CLINICAL_ASSIGNMENT_ROLES.includes(assignmentRole) ? assignmentRole : 'primary'
  const taskIds = formData.getAll('taskIds').filter((v): v is string => typeof v === 'string')
  const request = await getPlatformRequestMetadata()
  let stagedCount = 0,
    rejectedCount = 0
  try {
    const result = await stageReviewerInvitationAssignmentsForPlatform(db, {
      invitationId,
      taskIds,
      assignmentRole: role,
      actorUserId: ctx.user.id,
      platformStaffId: ctx.staff.id,
      validate: clinicalTaskValidator(
        invitation.professionalRole as ClinicalProfessionalRole,
        invitation.capabilities as ClinicalReviewerCapability[],
      ),
      ...request,
    })
    stagedCount = result.stagedCount
    rejectedCount = result.rejectedCount
  } catch (error) {
    redirect(
      withMessage(
        `/clinical-inceleme/davetler/${invitationId}`,
        'hata',
        error instanceof Error ? error.message : 'Görevler ayrılamadı.',
      ),
    )
  }
  revalidatePath(`/clinical-inceleme/davetler/${invitationId}`)
  redirect(
    withMessage(
      `/clinical-inceleme/davetler/${invitationId}`,
      'mesaj',
      `${stagedCount} görev ayrıldı; ${rejectedCount} görev uygun bulunmadı.`,
    ),
  )
}

export async function cancelInvitationTaskAction(formData: FormData) {
  const ctx = await requirePlatformPermission('clinical.tasks.assign')
  const invitationId = field(formData, 'invitationId')
  const request = await getPlatformRequestMetadata()
  try {
    await cancelReviewerInvitationAssignmentForPlatform(db, {
      invitationId,
      stagingId: field(formData, 'stagingId'),
      actorUserId: ctx.user.id,
      platformStaffId: ctx.staff.id,
      ...request,
    })
  } catch (error) {
    redirect(
      withMessage(
        `/clinical-inceleme/davetler/${invitationId}`,
        'hata',
        error instanceof Error ? error.message : 'Görev ayırma iptal edilemedi.',
      ),
    )
  }
  revalidatePath(`/clinical-inceleme/davetler/${invitationId}`)
  redirect(
    withMessage(
      `/clinical-inceleme/davetler/${invitationId}`,
      'mesaj',
      'Görev ayırma kaydı iptal edildi.',
    ),
  )
}

export async function transitionReviewerStatusAction(formData: FormData) {
  const ctx = await requirePlatformPermission('clinical.reviewers.manage')
  const userId = field(formData, 'userId')
  const toStatus = field(formData, 'toStatus') as ClinicalReviewerVerificationStatus
  const request = await getPlatformRequestMetadata()
  try {
    await transitionReviewerStatusForPlatform(db, {
      userId,
      toStatus,
      reason: field(formData, 'reason') || undefined,
      actorUserId: ctx.user.id,
      platformStaffId: ctx.staff.id,
      ...request,
    })
  } catch (error) {
    redirect(
      withMessage(
        `/clinical-inceleme/hakemler/${userId}`,
        'hata',
        error instanceof Error ? error.message : 'Durum güncellenemedi.',
      ),
    )
  }
  let message = 'Hakem durumu güncellendi.'
  if (toStatus === 'verified') {
    const reviewer = await getReviewerForPlatform(db, userId)
    if (reviewer) {
      try {
        await sendClinicalReviewerVerificationEmail({
          email: reviewer.userEmail,
          name: reviewer.userName,
          assignedReviewsUrl: webAssignedReviewsUrl(),
        })
      } catch {
        message = 'Hakem doğrulandı ancak erişim e-postası gönderilemedi.'
      }
    }
  }
  revalidatePath('/clinical-inceleme')
  redirect(withMessage(`/clinical-inceleme/hakemler/${userId}`, 'mesaj', message))
}

export async function updateReviewerCapabilitiesAction(formData: FormData) {
  const ctx = await requirePlatformPermission('clinical.reviewers.manage')
  const userId = field(formData, 'userId')
  const request = await getPlatformRequestMetadata()
  let incompatibleAssignmentCount = 0
  try {
    const result = await updateReviewerCapabilitiesForPlatform(db, {
      userId,
      capabilities: selectedCapabilities(formData),
      actorUserId: ctx.user.id,
      platformStaffId: ctx.staff.id,
      ...request,
    })
    incompatibleAssignmentCount = result.incompatibleAssignmentCount
  } catch (error) {
    redirect(
      withMessage(
        `/clinical-inceleme/hakemler/${userId}`,
        'hata',
        error instanceof Error ? error.message : 'Yetkinlikler güncellenemedi.',
      ),
    )
  }
  revalidatePath(`/clinical-inceleme/hakemler/${userId}`)
  redirect(
    withMessage(
      `/clinical-inceleme/hakemler/${userId}`,
      'mesaj',
      `Yetkinlikler güncellendi. ${incompatibleAssignmentCount} aktif atama artık uyumsuz.`,
    ),
  )
}

export async function assignTaskToReviewerAction(formData: FormData) {
  const ctx = await requirePlatformPermission('clinical.tasks.assign')
  const userId = field(formData, 'userId')
  const reviewer = await getReviewerForPlatform(db, userId)
  if (!reviewer) redirect('/clinical-inceleme/hakemler')
  const assignmentRole = field(formData, 'assignmentRole') as ClinicalAssignmentRole
  const role = CLINICAL_ASSIGNMENT_ROLES.includes(assignmentRole) ? assignmentRole : 'primary'
  const request = await getPlatformRequestMetadata()
  try {
    await assignTaskToReviewerForPlatform(db, {
      taskId: field(formData, 'taskId'),
      reviewerUserId: userId,
      assignmentRole: role,
      actorUserId: ctx.user.id,
      platformStaffId: ctx.staff.id,
      validate: clinicalTaskValidator(
        reviewer.professionalRole as ClinicalProfessionalRole,
        reviewer.capabilities,
      ),
      ...request,
    })
  } catch (error) {
    redirect(
      withMessage(
        `/clinical-inceleme/hakemler/${userId}`,
        'hata',
        error instanceof Error ? error.message : 'Görev atanamadı.',
      ),
    )
  }
  revalidatePath('/clinical-inceleme/gorevler')
  redirect(withMessage(`/clinical-inceleme/hakemler/${userId}`, 'mesaj', 'Görev atandı.'))
}

export async function assignTasksToReviewerAction(formData: FormData) {
  const ctx = await requirePlatformPermission('clinical.tasks.assign')
  const userId = field(formData, 'userId')
  const reviewer = await getReviewerForPlatform(db, userId)
  if (!reviewer) redirect('/clinical-inceleme/hakemler')
  const assignmentRole = field(formData, 'assignmentRole') as ClinicalAssignmentRole
  const role = CLINICAL_ASSIGNMENT_ROLES.includes(assignmentRole) ? assignmentRole : 'primary'
  const taskIds = [
    ...new Set(
      formData.getAll('taskIds').filter((value): value is string => typeof value === 'string'),
    ),
  ].slice(0, 100)
  if (!taskIds.length)
    redirect(withMessage(`/clinical-inceleme/hakemler/${userId}`, 'hata', 'En az bir görev seçin.'))
  const request = await getPlatformRequestMetadata()
  const validate = clinicalTaskValidator(
    reviewer.professionalRole as ClinicalProfessionalRole,
    reviewer.capabilities,
  )
  let assignedCount = 0
  let rejectedCount = 0
  for (const taskId of taskIds) {
    try {
      await assignTaskToReviewerForPlatform(db, {
        taskId,
        reviewerUserId: userId,
        assignmentRole: role,
        actorUserId: ctx.user.id,
        platformStaffId: ctx.staff.id,
        validate,
        ...request,
      })
      assignedCount += 1
    } catch {
      rejectedCount += 1
    }
  }
  revalidatePath('/clinical-inceleme/gorevler')
  redirect(
    withMessage(
      `/clinical-inceleme/hakemler/${userId}`,
      'mesaj',
      `${assignedCount} görev atandı; ${rejectedCount} görev uygun olmadığı için atlandı.`,
    ),
  )
}

export async function cancelReviewerAssignmentAction(formData: FormData) {
  const ctx = await requirePlatformPermission('clinical.tasks.assign')
  const userId = field(formData, 'userId')
  const request = await getPlatformRequestMetadata()
  try {
    await cancelReviewerAssignmentForPlatform(db, {
      assignmentId: field(formData, 'assignmentId'),
      reason: field(formData, 'reason'),
      actorUserId: ctx.user.id,
      platformStaffId: ctx.staff.id,
      ...request,
    })
  } catch (error) {
    redirect(
      withMessage(
        `/clinical-inceleme/hakemler/${userId}`,
        'hata',
        error instanceof Error ? error.message : 'Atama iptal edilemedi.',
      ),
    )
  }
  revalidatePath('/clinical-inceleme/gorevler')
  redirect(
    withMessage(
      `/clinical-inceleme/hakemler/${userId}`,
      'mesaj',
      'Atama iptal edildi; geçmiş korundu.',
    ),
  )
}

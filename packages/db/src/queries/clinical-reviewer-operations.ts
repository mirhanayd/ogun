import { and, asc, count, desc, eq, gt, ilike, inArray, or, sql, type SQL } from 'drizzle-orm'
import type { Database } from '../client'
import {
  clinicalReviewAssignments,
  clinicalReviewAuditLog,
  clinicalReviewDecisions,
  clinicalReviewerCapabilities,
  clinicalReviewerInvitationAssignments,
  clinicalReviewerInvitations,
  clinicalReviewerProfiles,
  clinicalReviewTasks,
  platformAuditLogs,
  platformStaff,
  users,
} from '../schema'
import { normalizeClinicalReviewerEmail } from '../clinical-reviewer-invitation'
import type {
  ClinicalProfessionalRole,
  ClinicalReviewerCapability,
  ClinicalReviewerVerificationStatus,
} from './clinical-review'

export type ClinicalAssignmentRole = 'primary' | 'secondary' | 'co_review'
export type ClinicalInvitationDisplayStatus = 'pending' | 'accepted' | 'revoked' | 'expired'

export interface ClinicalTaskEligibilityInput {
  id: string
  status: string
  subjectType: 'medication' | 'condition'
  targetType: string
  action: string
  requiredCapability: string
}

export type ClinicalTaskEligibilityValidator = (
  task: ClinicalTaskEligibilityInput,
  assignmentRole: ClinicalAssignmentRole,
  reviewer?: {
    professionalRole: ClinicalProfessionalRole
    capabilities: ClinicalReviewerCapability[]
  },
) => { eligible: boolean; reason?: string }

export class ClinicalReviewerOperationError extends Error {
  constructor(
    public readonly code:
      | 'duplicate_invitation'
      | 'reviewer_exists'
      | 'not_found'
      | 'expired'
      | 'revoked'
      | 'accepted'
      | 'cooldown'
      | 'email_mismatch'
      | 'invalid_transition'
      | 'ineligible',
    message: string,
    public readonly relatedId?: string,
  ) {
    super(message)
    this.name = 'ClinicalReviewerOperationError'
  }
}

function displayStatus(
  status: string,
  expiresAt: Date,
  now: Date,
): ClinicalInvitationDisplayStatus {
  return status === 'pending' && expiresAt <= now
    ? 'expired'
    : (status as ClinicalInvitationDisplayStatus)
}

function platformAuditValues(input: {
  actorUserId: string
  platformStaffId: string
  action: string
  entityType: string
  entityId: string
  metadata?: Record<string, unknown>
  ipAddress?: string | null
  userAgent?: string | null
}) {
  return {
    actorUserId: input.actorUserId,
    platformStaffId: input.platformStaffId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    outcome: 'success' as const,
    metadata: input.metadata,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
  }
}

function clinicalAuditValues(input: {
  taskId?: string | null
  actorUserId: string
  eventType: typeof clinicalReviewAuditLog.$inferInsert.eventType
  fromStatus?: string | null
  toStatus?: string | null
  summary: string
}) {
  return {
    id: `cral_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`,
    taskId: input.taskId ?? null,
    actorUserId: input.actorUserId,
    eventType: input.eventType,
    fromStatus: input.fromStatus ?? null,
    toStatus: input.toStatus ?? null,
    compactChangeSummary: input.summary,
  }
}

export interface CreateReviewerInvitationInput {
  email: string
  name: string
  professionalRole: ClinicalProfessionalRole
  specialty: string | null
  capabilities: ClinicalReviewerCapability[]
  professionalVerificationConfirmed: boolean
  tokenHash: string
  expiresAt: Date
  actorUserId: string
  platformStaffId: string
  ipAddress?: string | null
  userAgent?: string | null
  now?: Date
}

export async function createReviewerInvitationForPlatform(
  db: Database,
  input: CreateReviewerInvitationInput,
) {
  const now = input.now ?? new Date()
  const normalizedEmail = normalizeClinicalReviewerEmail(input.email)
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`clinical-reviewer:${normalizedEmail}`}))`,
    )

    const [reviewer] = await tx
      .select({ userId: clinicalReviewerProfiles.userId })
      .from(users)
      .innerJoin(clinicalReviewerProfiles, eq(clinicalReviewerProfiles.userId, users.id))
      .where(
        and(
          sql`lower(${users.email}) = ${normalizedEmail}`,
          or(
            eq(clinicalReviewerProfiles.isActive, true),
            eq(clinicalReviewerProfiles.verificationStatus, 'pending'),
            eq(clinicalReviewerProfiles.verificationStatus, 'verified'),
            eq(clinicalReviewerProfiles.verificationStatus, 'suspended'),
          ),
        ),
      )
      .limit(1)
    if (reviewer) {
      throw new ClinicalReviewerOperationError(
        'reviewer_exists',
        'Bu e-posta için zaten clinical reviewer profili bulunuyor.',
        reviewer.userId,
      )
    }

    const [pending] = await tx
      .select({ id: clinicalReviewerInvitations.id })
      .from(clinicalReviewerInvitations)
      .where(
        and(
          eq(clinicalReviewerInvitations.normalizedEmail, normalizedEmail),
          eq(clinicalReviewerInvitations.status, 'pending'),
          gt(clinicalReviewerInvitations.expiresAt, now),
        ),
      )
      .limit(1)
    if (pending) {
      throw new ClinicalReviewerOperationError(
        'duplicate_invitation',
        'Bu e-posta için zaten geçerli bir davet bulunuyor.',
        pending.id,
      )
    }

    const [invitation] = await tx
      .insert(clinicalReviewerInvitations)
      .values({
        email: input.email.trim(),
        normalizedEmail,
        name: input.name.trim(),
        professionalRole: input.professionalRole,
        specialty: input.specialty,
        capabilities: [...new Set(input.capabilities)],
        professionalVerificationConfirmed: input.professionalVerificationConfirmed,
        verifiedByUserId: input.professionalVerificationConfirmed ? input.actorUserId : null,
        professionalVerifiedAt: input.professionalVerificationConfirmed ? now : null,
        status: 'pending',
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        createdByPlatformStaffId: input.platformStaffId,
        emailDeliveryStatus: 'pending',
        emailAttemptCount: 1,
        lastEmailAttemptAt: now,
      })
      .returning({
        id: clinicalReviewerInvitations.id,
        email: clinicalReviewerInvitations.email,
        name: clinicalReviewerInvitations.name,
        professionalRole: clinicalReviewerInvitations.professionalRole,
        specialty: clinicalReviewerInvitations.specialty,
        expiresAt: clinicalReviewerInvitations.expiresAt,
      })
    if (!invitation) throw new Error('Hakem daveti oluşturulamadı.')

    await tx.insert(clinicalReviewAuditLog).values(
      clinicalAuditValues({
        actorUserId: input.actorUserId,
        eventType: 'reviewer_invited',
        toStatus: 'pending',
        summary: `${invitation.email} adresine clinical reviewer daveti oluşturuldu.`,
      }),
    )
    await tx.insert(platformAuditLogs).values(
      platformAuditValues({
        ...input,
        action: 'clinical.reviewer.invited',
        entityType: 'clinical_reviewer_invitation',
        entityId: invitation.id,
        metadata: {
          professionalRole: input.professionalRole,
          capabilityCount: input.capabilities.length,
          professionalVerificationConfirmed: input.professionalVerificationConfirmed,
        },
      }),
    )
    return invitation
  })
}

export async function recordReviewerInvitationEmailResult(
  db: Database,
  invitationId: string,
  result: { sent: true; now?: Date } | { sent: false; error: string; now?: Date },
) {
  const now = result.now ?? new Date()
  await db
    .update(clinicalReviewerInvitations)
    .set({
      emailDeliveryStatus: result.sent ? 'sent' : 'failed',
      lastEmailSentAt: result.sent ? now : null,
      lastEmailError: result.sent ? null : result.error.slice(0, 1_000),
      updatedAt: now,
    })
    .where(eq(clinicalReviewerInvitations.id, invitationId))
}

export async function rotateReviewerInvitationTokenForPlatform(
  db: Database,
  input: {
    invitationId: string
    tokenHash: string
    expiresAt: Date
    actorUserId: string
    platformStaffId: string
    cooldownMs: number
    ipAddress?: string | null
    userAgent?: string | null
    now?: Date
  },
) {
  const now = input.now ?? new Date()
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        id: clinicalReviewerInvitations.id,
        email: clinicalReviewerInvitations.email,
        name: clinicalReviewerInvitations.name,
        professionalRole: clinicalReviewerInvitations.professionalRole,
        specialty: clinicalReviewerInvitations.specialty,
        status: clinicalReviewerInvitations.status,
        lastEmailAttemptAt: clinicalReviewerInvitations.lastEmailAttemptAt,
      })
      .from(clinicalReviewerInvitations)
      .where(eq(clinicalReviewerInvitations.id, input.invitationId))
      .limit(1)
      .for('update')
    if (!row) throw new ClinicalReviewerOperationError('not_found', 'Davet bulunamadı.')
    if (row.status === 'revoked')
      throw new ClinicalReviewerOperationError(
        'revoked',
        'İptal edilmiş davet yeniden gönderilemez.',
      )
    if (row.status === 'accepted')
      throw new ClinicalReviewerOperationError(
        'accepted',
        'Kabul edilmiş davet yeniden gönderilemez.',
      )
    if (
      row.lastEmailAttemptAt &&
      now.getTime() - row.lastEmailAttemptAt.getTime() < input.cooldownMs
    ) {
      throw new ClinicalReviewerOperationError(
        'cooldown',
        'Davet e-postası 60 saniyede bir gönderilebilir.',
      )
    }
    await tx
      .update(clinicalReviewerInvitations)
      .set({
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        emailDeliveryStatus: 'pending',
        emailAttemptCount: sql`${clinicalReviewerInvitations.emailAttemptCount} + 1`,
        lastEmailAttemptAt: now,
        lastEmailError: null,
        updatedAt: now,
      })
      .where(eq(clinicalReviewerInvitations.id, row.id))
    await tx.insert(platformAuditLogs).values(
      platformAuditValues({
        ...input,
        action: 'clinical.reviewer.invitation_resent',
        entityType: 'clinical_reviewer_invitation',
        entityId: row.id,
      }),
    )
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      professionalRole: row.professionalRole,
      specialty: row.specialty,
      expiresAt: input.expiresAt,
    }
  })
}

export async function revokeReviewerInvitationForPlatform(
  db: Database,
  input: {
    invitationId: string
    reason: string
    actorUserId: string
    platformStaffId: string
    ipAddress?: string | null
    userAgent?: string | null
    now?: Date
  },
) {
  const now = input.now ?? new Date()
  if (input.reason.trim().length < 3) throw new Error('İptal nedeni zorunludur.')
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: clinicalReviewerInvitations.id, status: clinicalReviewerInvitations.status })
      .from(clinicalReviewerInvitations)
      .where(eq(clinicalReviewerInvitations.id, input.invitationId))
      .limit(1)
      .for('update')
    if (!row) throw new ClinicalReviewerOperationError('not_found', 'Davet bulunamadı.')
    if (row.status === 'accepted')
      throw new ClinicalReviewerOperationError('accepted', 'Kabul edilmiş davet iptal edilemez.')
    if (row.status === 'revoked')
      throw new ClinicalReviewerOperationError('revoked', 'Davet zaten iptal edilmiş.')
    await tx
      .update(clinicalReviewerInvitations)
      .set({
        status: 'revoked',
        revokedAt: now,
        revokedByPlatformStaffId: input.platformStaffId,
        revokedReason: input.reason.trim(),
        updatedAt: now,
      })
      .where(eq(clinicalReviewerInvitations.id, row.id))
    await tx
      .update(clinicalReviewerInvitationAssignments)
      .set({ status: 'cancelled', cancelledAt: now })
      .where(
        and(
          eq(clinicalReviewerInvitationAssignments.invitationId, row.id),
          eq(clinicalReviewerInvitationAssignments.status, 'pending'),
        ),
      )
    await tx.insert(platformAuditLogs).values(
      platformAuditValues({
        ...input,
        action: 'clinical.reviewer.invitation_revoked',
        entityType: 'clinical_reviewer_invitation',
        entityId: row.id,
        metadata: { reason: input.reason.trim() },
      }),
    )
    return { id: row.id }
  })
}

export async function listReviewerInvitationsForPlatform(
  db: Database,
  filters: {
    search?: string
    status?: ClinicalInvitationDisplayStatus | 'email_failed'
    page?: number
    pageSize?: 25 | 50 | 100
  } = {},
  now = new Date(),
) {
  const page = Math.max(1, Math.trunc(filters.page ?? 1))
  const pageSize = ([25, 50, 100] as const).includes(filters.pageSize as 25 | 50 | 100)
    ? filters.pageSize!
    : 25
  const conditions: SQL[] = []
  if (filters.search?.trim())
    conditions.push(
      or(
        ilike(clinicalReviewerInvitations.name, `%${filters.search.trim()}%`),
        ilike(
          clinicalReviewerInvitations.normalizedEmail,
          `%${filters.search.trim().toLowerCase()}%`,
        ),
      )!,
    )
  if (filters.status === 'expired')
    conditions.push(
      and(
        eq(clinicalReviewerInvitations.status, 'pending'),
        sql`${clinicalReviewerInvitations.expiresAt} <= ${now}`,
      )!,
    )
  else if (filters.status === 'email_failed')
    conditions.push(eq(clinicalReviewerInvitations.emailDeliveryStatus, 'failed'))
  else if (filters.status)
    conditions.push(
      and(
        eq(clinicalReviewerInvitations.status, filters.status),
        filters.status === 'pending' ? gt(clinicalReviewerInvitations.expiresAt, now) : undefined,
      )!,
    )
  const where = conditions.length ? and(...conditions) : undefined
  const stagedCount = sql<number>`(select count(*)::int from ${clinicalReviewerInvitationAssignments} a where a.invitation_id = ${clinicalReviewerInvitations.id})`
  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: clinicalReviewerInvitations.id,
        email: clinicalReviewerInvitations.email,
        name: clinicalReviewerInvitations.name,
        professionalRole: clinicalReviewerInvitations.professionalRole,
        specialty: clinicalReviewerInvitations.specialty,
        capabilities: clinicalReviewerInvitations.capabilities,
        professionalVerificationConfirmed:
          clinicalReviewerInvitations.professionalVerificationConfirmed,
        status: clinicalReviewerInvitations.status,
        expiresAt: clinicalReviewerInvitations.expiresAt,
        acceptedAt: clinicalReviewerInvitations.acceptedAt,
        acceptedByUserId: clinicalReviewerInvitations.acceptedByUserId,
        revokedAt: clinicalReviewerInvitations.revokedAt,
        revokedReason: clinicalReviewerInvitations.revokedReason,
        emailDeliveryStatus: clinicalReviewerInvitations.emailDeliveryStatus,
        emailAttemptCount: clinicalReviewerInvitations.emailAttemptCount,
        lastEmailSentAt: clinicalReviewerInvitations.lastEmailSentAt,
        lastEmailError: clinicalReviewerInvitations.lastEmailError,
        stagedAssignmentCount: stagedCount,
        createdAt: clinicalReviewerInvitations.createdAt,
      })
      .from(clinicalReviewerInvitations)
      .where(where)
      .orderBy(desc(clinicalReviewerInvitations.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(clinicalReviewerInvitations).where(where),
  ])
  return {
    rows: rows.map((row) => ({
      ...row,
      displayStatus: displayStatus(row.status, row.expiresAt, now),
    })),
    total: totalRow?.total ?? 0,
    page,
    pageSize,
  }
}

export async function getReviewerInvitationForPlatform(
  db: Database,
  invitationId: string,
  now = new Date(),
) {
  const [row] = await db
    .select({
      id: clinicalReviewerInvitations.id,
      email: clinicalReviewerInvitations.email,
      normalizedEmail: clinicalReviewerInvitations.normalizedEmail,
      name: clinicalReviewerInvitations.name,
      professionalRole: clinicalReviewerInvitations.professionalRole,
      specialty: clinicalReviewerInvitations.specialty,
      capabilities: clinicalReviewerInvitations.capabilities,
      professionalVerificationConfirmed:
        clinicalReviewerInvitations.professionalVerificationConfirmed,
      verifiedByUserId: clinicalReviewerInvitations.verifiedByUserId,
      professionalVerifiedAt: clinicalReviewerInvitations.professionalVerifiedAt,
      status: clinicalReviewerInvitations.status,
      expiresAt: clinicalReviewerInvitations.expiresAt,
      acceptedAt: clinicalReviewerInvitations.acceptedAt,
      acceptedByUserId: clinicalReviewerInvitations.acceptedByUserId,
      revokedAt: clinicalReviewerInvitations.revokedAt,
      revokedReason: clinicalReviewerInvitations.revokedReason,
      createdByPlatformStaffId: clinicalReviewerInvitations.createdByPlatformStaffId,
      emailDeliveryStatus: clinicalReviewerInvitations.emailDeliveryStatus,
      emailAttemptCount: clinicalReviewerInvitations.emailAttemptCount,
      lastEmailAttemptAt: clinicalReviewerInvitations.lastEmailAttemptAt,
      lastEmailSentAt: clinicalReviewerInvitations.lastEmailSentAt,
      lastEmailError: clinicalReviewerInvitations.lastEmailError,
      createdAt: clinicalReviewerInvitations.createdAt,
      updatedAt: clinicalReviewerInvitations.updatedAt,
    })
    .from(clinicalReviewerInvitations)
    .where(eq(clinicalReviewerInvitations.id, invitationId))
    .limit(1)
  if (!row) return null
  const assignments = await db
    .select({
      id: clinicalReviewerInvitationAssignments.id,
      taskId: clinicalReviewerInvitationAssignments.taskId,
      assignmentRole: clinicalReviewerInvitationAssignments.assignmentRole,
      status: clinicalReviewerInvitationAssignments.status,
      materializedAssignmentId: clinicalReviewerInvitationAssignments.materializedAssignmentId,
      invalidationReason: clinicalReviewerInvitationAssignments.invalidationReason,
      createdAt: clinicalReviewerInvitationAssignments.createdAt,
      materializedAt: clinicalReviewerInvitationAssignments.materializedAt,
      cancelledAt: clinicalReviewerInvitationAssignments.cancelledAt,
      reviewPriority: clinicalReviewTasks.reviewPriority,
      taskStatus: clinicalReviewTasks.status,
      subjectType: clinicalReviewTasks.subjectType,
      requiredCapability: clinicalReviewTasks.requiredCapability,
      targetKey: clinicalReviewTasks.targetKey,
    })
    .from(clinicalReviewerInvitationAssignments)
    .innerJoin(
      clinicalReviewTasks,
      eq(clinicalReviewTasks.id, clinicalReviewerInvitationAssignments.taskId),
    )
    .where(eq(clinicalReviewerInvitationAssignments.invitationId, invitationId))
    .orderBy(desc(clinicalReviewerInvitationAssignments.createdAt))
  return { ...row, displayStatus: displayStatus(row.status, row.expiresAt, now), assignments }
}

export async function getReviewerInvitationPreviewByTokenHash(
  db: Database,
  tokenHash: string,
  now = new Date(),
) {
  const [row] = await db
    .select({
      id: clinicalReviewerInvitations.id,
      email: clinicalReviewerInvitations.email,
      name: clinicalReviewerInvitations.name,
      status: clinicalReviewerInvitations.status,
      expiresAt: clinicalReviewerInvitations.expiresAt,
    })
    .from(clinicalReviewerInvitations)
    .where(eq(clinicalReviewerInvitations.tokenHash, tokenHash))
    .limit(1)
  if (!row) return null
  const [account] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${normalizeClinicalReviewerEmail(row.email)}`)
    .limit(1)
  return {
    ...row,
    displayStatus: displayStatus(row.status, row.expiresAt, now),
    accountExists: Boolean(account),
  }
}

export async function stageReviewerInvitationAssignmentsForPlatform(
  db: Database,
  input: {
    invitationId: string
    taskIds: string[]
    assignmentRole: ClinicalAssignmentRole
    actorUserId: string
    platformStaffId: string
    validate: ClinicalTaskEligibilityValidator
    ipAddress?: string | null
    userAgent?: string | null
    now?: Date
  },
) {
  const now = input.now ?? new Date()
  return db.transaction(async (tx) => {
    const [invite] = await tx
      .select({
        id: clinicalReviewerInvitations.id,
        status: clinicalReviewerInvitations.status,
        expiresAt: clinicalReviewerInvitations.expiresAt,
        professionalRole: clinicalReviewerInvitations.professionalRole,
        capabilities: clinicalReviewerInvitations.capabilities,
      })
      .from(clinicalReviewerInvitations)
      .where(eq(clinicalReviewerInvitations.id, input.invitationId))
      .limit(1)
      .for('update')
    if (!invite) throw new ClinicalReviewerOperationError('not_found', 'Davet bulunamadı.')
    if (invite.status !== 'pending')
      throw new ClinicalReviewerOperationError(
        invite.status as 'accepted' | 'revoked',
        'Yalnızca bekleyen davete görev ayrılabilir.',
      )
    if (invite.expiresAt <= now)
      throw new ClinicalReviewerOperationError('expired', 'Süresi dolmuş davete görev ayrılamaz.')
    const uniqueTaskIds = [...new Set(input.taskIds)].slice(0, 100)
    const tasks = uniqueTaskIds.length
      ? await tx
          .select({
            id: clinicalReviewTasks.id,
            status: clinicalReviewTasks.status,
            subjectType: clinicalReviewTasks.subjectType,
            targetType: clinicalReviewTasks.targetType,
            action: clinicalReviewTasks.action,
            requiredCapability: clinicalReviewTasks.requiredCapability,
          })
          .from(clinicalReviewTasks)
          .where(inArray(clinicalReviewTasks.id, uniqueTaskIds))
          .for('update')
      : []
    const eligible = tasks.filter(
      (task) =>
        input.validate(task as ClinicalTaskEligibilityInput, input.assignmentRole, {
          professionalRole: invite.professionalRole as ClinicalProfessionalRole,
          capabilities: invite.capabilities as ClinicalReviewerCapability[],
        }).eligible,
    )
    if (eligible.length)
      await tx
        .insert(clinicalReviewerInvitationAssignments)
        .values(
          eligible.map((task) => ({
            invitationId: invite.id,
            taskId: task.id,
            assignmentRole: input.assignmentRole,
            status: 'pending',
            createdByPlatformStaffId: input.platformStaffId,
          })),
        )
        .onConflictDoNothing({
          target: [
            clinicalReviewerInvitationAssignments.invitationId,
            clinicalReviewerInvitationAssignments.taskId,
          ],
        })
    await tx.insert(platformAuditLogs).values(
      platformAuditValues({
        ...input,
        action: 'clinical.task.preassigned',
        entityType: 'clinical_reviewer_invitation',
        entityId: invite.id,
        metadata: {
          requestedCount: uniqueTaskIds.length,
          eligibleCount: eligible.length,
          assignmentRole: input.assignmentRole,
        },
      }),
    )
    return {
      requestedCount: uniqueTaskIds.length,
      stagedCount: eligible.length,
      rejectedCount: uniqueTaskIds.length - eligible.length,
    }
  })
}

export async function cancelReviewerInvitationAssignmentForPlatform(
  db: Database,
  input: {
    invitationId: string
    stagingId: string
    actorUserId: string
    platformStaffId: string
    ipAddress?: string | null
    userAgent?: string | null
    now?: Date
  },
) {
  const now = input.now ?? new Date()
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(clinicalReviewerInvitationAssignments)
      .set({ status: 'cancelled', cancelledAt: now })
      .where(
        and(
          eq(clinicalReviewerInvitationAssignments.id, input.stagingId),
          eq(clinicalReviewerInvitationAssignments.invitationId, input.invitationId),
          eq(clinicalReviewerInvitationAssignments.status, 'pending'),
        ),
      )
      .returning({
        id: clinicalReviewerInvitationAssignments.id,
        taskId: clinicalReviewerInvitationAssignments.taskId,
      })
    if (!row)
      throw new ClinicalReviewerOperationError(
        'not_found',
        'Bekleyen görev ayırma kaydı bulunamadı.',
      )
    await tx.insert(platformAuditLogs).values(
      platformAuditValues({
        ...input,
        action: 'clinical.task.preassignment_cancelled',
        entityType: 'clinical_reviewer_invitation_assignment',
        entityId: row.id,
        metadata: { taskId: row.taskId },
      }),
    )
    return row
  })
}

export async function updateReviewerInvitationCapabilitiesForPlatform(
  db: Database,
  input: {
    invitationId: string
    capabilities: ClinicalReviewerCapability[]
    actorUserId: string
    platformStaffId: string
    validate: ClinicalTaskEligibilityValidator
    ipAddress?: string | null
    userAgent?: string | null
    now?: Date
  },
) {
  const now = input.now ?? new Date()
  return db.transaction(async (tx) => {
    const [invite] = await tx
      .select({
        id: clinicalReviewerInvitations.id,
        status: clinicalReviewerInvitations.status,
        professionalRole: clinicalReviewerInvitations.professionalRole,
      })
      .from(clinicalReviewerInvitations)
      .where(eq(clinicalReviewerInvitations.id, input.invitationId))
      .limit(1)
      .for('update')
    if (!invite) throw new ClinicalReviewerOperationError('not_found', 'Davet bulunamadı.')
    if (invite.status !== 'pending')
      throw new ClinicalReviewerOperationError(
        invite.status as 'accepted' | 'revoked',
        'Kabul veya iptal edilmiş davet değiştirilemez.',
      )
    const capabilities = [...new Set(input.capabilities)]
    await tx
      .update(clinicalReviewerInvitations)
      .set({ capabilities, updatedAt: now })
      .where(eq(clinicalReviewerInvitations.id, invite.id))
    const staged = await tx
      .select({
        id: clinicalReviewerInvitationAssignments.id,
        assignmentRole: clinicalReviewerInvitationAssignments.assignmentRole,
        taskId: clinicalReviewTasks.id,
        status: clinicalReviewTasks.status,
        subjectType: clinicalReviewTasks.subjectType,
        targetType: clinicalReviewTasks.targetType,
        action: clinicalReviewTasks.action,
        requiredCapability: clinicalReviewTasks.requiredCapability,
      })
      .from(clinicalReviewerInvitationAssignments)
      .innerJoin(
        clinicalReviewTasks,
        eq(clinicalReviewTasks.id, clinicalReviewerInvitationAssignments.taskId),
      )
      .where(
        and(
          eq(clinicalReviewerInvitationAssignments.invitationId, invite.id),
          eq(clinicalReviewerInvitationAssignments.status, 'pending'),
        ),
      )
      .for('update')
    const invalid = staged.filter(
      (item) =>
        !input.validate(
          {
            id: item.taskId,
            status: item.status,
            subjectType: item.subjectType as 'medication' | 'condition',
            targetType: item.targetType,
            action: item.action,
            requiredCapability: item.requiredCapability,
          },
          item.assignmentRole as ClinicalAssignmentRole,
          { professionalRole: invite.professionalRole as ClinicalProfessionalRole, capabilities },
        ).eligible,
    )
    if (invalid.length)
      await tx
        .update(clinicalReviewerInvitationAssignments)
        .set({
          status: 'invalidated',
          invalidatedAt: now,
          invalidationReason: 'Capability değişikliği sonrasında görev uygun değil.',
        })
        .where(
          inArray(
            clinicalReviewerInvitationAssignments.id,
            invalid.map((item) => item.id),
          ),
        )
    await tx.insert(clinicalReviewAuditLog).values(
      clinicalAuditValues({
        actorUserId: input.actorUserId,
        eventType: 'reviewer_capabilities_changed',
        summary: `Davet yetkinlikleri değiştirildi; ${invalid.length} görev ayırma kaydı geçersizleştirildi.`,
      }),
    )
    await tx.insert(platformAuditLogs).values(
      platformAuditValues({
        ...input,
        action: 'clinical.reviewer.invitation_capabilities_changed',
        entityType: 'clinical_reviewer_invitation',
        entityId: invite.id,
        metadata: { capabilities, invalidatedCount: invalid.length },
      }),
    )
    return { invalidatedCount: invalid.length }
  })
}

export async function acceptReviewerInvitation(
  db: Database,
  input: {
    tokenHash: string
    userId: string
    userEmail: string
    validate: ClinicalTaskEligibilityValidator
    now?: Date
  },
) {
  const now = input.now ?? new Date()
  return db.transaction(async (tx) => {
    const [invite] = await tx
      .select()
      .from(clinicalReviewerInvitations)
      .where(eq(clinicalReviewerInvitations.tokenHash, input.tokenHash))
      .limit(1)
      .for('update')
    if (!invite) throw new ClinicalReviewerOperationError('not_found', 'Davet bağlantısı geçersiz.')
    if (invite.status === 'accepted')
      throw new ClinicalReviewerOperationError('accepted', 'Bu davet daha önce kullanılmış.')
    if (invite.status === 'revoked')
      throw new ClinicalReviewerOperationError('revoked', 'Bu davet iptal edilmiş.')
    if (invite.expiresAt <= now)
      throw new ClinicalReviewerOperationError('expired', 'Bu davetin süresi dolmuş.')
    if (normalizeClinicalReviewerEmail(input.userEmail) !== invite.normalizedEmail)
      throw new ClinicalReviewerOperationError(
        'email_mismatch',
        'Bu daveti yalnızca davet edilen e-posta hesabı kabul edebilir.',
      )

    // Possession of the single-use invitation token proves control of the
    // invited mailbox. Keep this update in the same transaction as token
    // consumption so a failed acceptance cannot partially verify an account.
    await tx
      .update(users)
      .set({ emailVerified: true, updatedAt: now })
      .where(eq(users.id, input.userId))

    const [existingProfile] = await tx
      .select({ verificationStatus: clinicalReviewerProfiles.verificationStatus })
      .from(clinicalReviewerProfiles)
      .where(eq(clinicalReviewerProfiles.userId, input.userId))
      .limit(1)
      .for('update')
    if (existingProfile && existingProfile.verificationStatus !== 'rejected') {
      throw new ClinicalReviewerOperationError(
        'reviewer_exists',
        'Bu hesap için zaten clinical reviewer profili bulunuyor.',
      )
    }

    const verificationStatus: ClinicalReviewerVerificationStatus =
      invite.professionalVerificationConfirmed ? 'verified' : 'pending'
    await tx
      .insert(clinicalReviewerProfiles)
      .values({
        userId: input.userId,
        professionalRole: invite.professionalRole,
        specialty: invite.specialty,
        verificationStatus,
        verifiedAt: invite.professionalVerificationConfirmed ? invite.professionalVerifiedAt : null,
        verifiedBy: invite.professionalVerificationConfirmed ? invite.verifiedByUserId : null,
        isActive: invite.professionalVerificationConfirmed,
        canPublish: false,
      })
      .onConflictDoUpdate({
        target: clinicalReviewerProfiles.userId,
        set: {
          professionalRole: invite.professionalRole,
          specialty: invite.specialty,
          verificationStatus,
          verifiedAt: invite.professionalVerificationConfirmed
            ? invite.professionalVerifiedAt
            : null,
          verifiedBy: invite.professionalVerificationConfirmed ? invite.verifiedByUserId : null,
          isActive: invite.professionalVerificationConfirmed,
          updatedAt: now,
        },
      })
    await tx
      .delete(clinicalReviewerCapabilities)
      .where(eq(clinicalReviewerCapabilities.reviewerUserId, input.userId))
    const capabilities = (invite.capabilities ?? []) as ClinicalReviewerCapability[]
    if (capabilities.length)
      await tx
        .insert(clinicalReviewerCapabilities)
        .values(capabilities.map((capability) => ({ reviewerUserId: input.userId, capability })))

    const [creator] = await tx
      .select({ userId: platformStaff.userId })
      .from(platformStaff)
      .where(eq(platformStaff.id, invite.createdByPlatformStaffId))
      .limit(1)
    if (!creator) throw new Error('Davet oluşturan platform personeli bulunamadı.')
    const staged = await tx
      .select({
        id: clinicalReviewerInvitationAssignments.id,
        assignmentRole: clinicalReviewerInvitationAssignments.assignmentRole,
        taskId: clinicalReviewTasks.id,
        taskStatus: clinicalReviewTasks.status,
        version: clinicalReviewTasks.version,
        subjectType: clinicalReviewTasks.subjectType,
        targetType: clinicalReviewTasks.targetType,
        action: clinicalReviewTasks.action,
        requiredCapability: clinicalReviewTasks.requiredCapability,
      })
      .from(clinicalReviewerInvitationAssignments)
      .innerJoin(
        clinicalReviewTasks,
        eq(clinicalReviewTasks.id, clinicalReviewerInvitationAssignments.taskId),
      )
      .where(
        and(
          eq(clinicalReviewerInvitationAssignments.invitationId, invite.id),
          eq(clinicalReviewerInvitationAssignments.status, 'pending'),
        ),
      )
      .for('update')
    let materializedCount = 0
    let invalidatedCount = 0
    for (const item of staged) {
      const eligible = input.validate(
        {
          id: item.taskId,
          status: item.taskStatus,
          subjectType: item.subjectType as 'medication' | 'condition',
          targetType: item.targetType,
          action: item.action,
          requiredCapability: item.requiredCapability,
        },
        item.assignmentRole as ClinicalAssignmentRole,
        { professionalRole: invite.professionalRole as ClinicalProfessionalRole, capabilities },
      )
      if (!eligible.eligible) {
        await tx
          .update(clinicalReviewerInvitationAssignments)
          .set({
            status: 'invalidated',
            invalidatedAt: now,
            invalidationReason: eligible.reason?.slice(0, 500) ?? 'Görev artık uygun değil.',
          })
          .where(eq(clinicalReviewerInvitationAssignments.id, item.id))
        invalidatedCount++
        continue
      }
      const [existing] = await tx
        .select({ id: clinicalReviewAssignments.id, status: clinicalReviewAssignments.status })
        .from(clinicalReviewAssignments)
        .where(
          and(
            eq(clinicalReviewAssignments.taskId, item.taskId),
            eq(clinicalReviewAssignments.reviewerUserId, input.userId),
          ),
        )
        .limit(1)
        .for('update')
      if (existing?.status === 'cancelled') {
        await tx
          .update(clinicalReviewerInvitationAssignments)
          .set({
            status: 'invalidated',
            invalidatedAt: now,
            invalidationReason: 'Bu görev için daha önce iptal edilmiş bir atama bulunuyor.',
          })
          .where(eq(clinicalReviewerInvitationAssignments.id, item.id))
        invalidatedCount++
        continue
      }
      let assignmentId = existing?.id
      if (!assignmentId) {
        const [created] = await tx
          .insert(clinicalReviewAssignments)
          .values({
            id: `cra_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`,
            taskId: item.taskId,
            reviewerUserId: input.userId,
            assignmentRole: item.assignmentRole,
            status: 'assigned',
            assignedBy: creator.userId,
            assignedAt: now,
          })
          .onConflictDoNothing({
            target: [clinicalReviewAssignments.taskId, clinicalReviewAssignments.reviewerUserId],
          })
          .returning({ id: clinicalReviewAssignments.id })
        assignmentId = created?.id
        if (!assignmentId) {
          const [raced] = await tx
            .select({ id: clinicalReviewAssignments.id })
            .from(clinicalReviewAssignments)
            .where(
              and(
                eq(clinicalReviewAssignments.taskId, item.taskId),
                eq(clinicalReviewAssignments.reviewerUserId, input.userId),
              ),
            )
            .limit(1)
          assignmentId = raced?.id
        }
      }
      if (!assignmentId) throw new Error('Görev ataması oluşturulamadı.')
      await tx
        .update(clinicalReviewerInvitationAssignments)
        .set({
          status: 'materialized',
          materializedAssignmentId: assignmentId,
          materializedAt: now,
        })
        .where(eq(clinicalReviewerInvitationAssignments.id, item.id))
      if (item.taskStatus === 'pending')
        await tx
          .update(clinicalReviewTasks)
          .set({ status: 'assigned', version: item.version + 1, updatedAt: now })
          .where(
            and(
              eq(clinicalReviewTasks.id, item.taskId),
              eq(clinicalReviewTasks.version, item.version),
              eq(clinicalReviewTasks.status, 'pending'),
            ),
          )
      await tx.insert(clinicalReviewAuditLog).values(
        clinicalAuditValues({
          taskId: item.taskId,
          actorUserId: creator.userId,
          eventType: 'task_assigned',
          fromStatus: item.taskStatus,
          toStatus: item.taskStatus === 'pending' ? 'assigned' : item.taskStatus,
          summary: `${input.userEmail} hakemine davet üzerinden görev atandı.`,
        }),
      )
      materializedCount++
    }
    const [accepted] = await tx
      .update(clinicalReviewerInvitations)
      .set({ status: 'accepted', acceptedAt: now, acceptedByUserId: input.userId, updatedAt: now })
      .where(
        and(
          eq(clinicalReviewerInvitations.id, invite.id),
          eq(clinicalReviewerInvitations.status, 'pending'),
          eq(clinicalReviewerInvitations.tokenHash, input.tokenHash),
          gt(clinicalReviewerInvitations.expiresAt, now),
        ),
      )
      .returning({ id: clinicalReviewerInvitations.id })
    if (!accepted)
      throw new ClinicalReviewerOperationError('accepted', 'Bu davet daha önce kullanılmış.')
    await tx.insert(clinicalReviewAuditLog).values(
      clinicalAuditValues({
        actorUserId: input.userId,
        eventType: 'reviewer_invite_accepted',
        fromStatus: 'pending',
        toStatus: verificationStatus,
        summary: `Reviewer daveti kabul edildi; ${materializedCount} görev ataması oluşturuldu, ${invalidatedCount} kayıt geçersizleştirildi.`,
      }),
    )
    return { invitationId: invite.id, verificationStatus, materializedCount, invalidatedCount }
  })
}

export async function listReviewersForPlatform(
  db: Database,
  filters: {
    search?: string
    professionalRole?: string
    verificationStatus?: string
    active?: 'active' | 'inactive'
    capability?: string
    page?: number
    pageSize?: 25 | 50 | 100
  } = {},
) {
  const page = Math.max(1, Math.trunc(filters.page ?? 1))
  const pageSize = ([25, 50, 100] as const).includes(filters.pageSize as 25 | 50 | 100)
    ? filters.pageSize!
    : 25
  const conditions: SQL[] = []
  if (filters.search?.trim())
    conditions.push(
      or(
        ilike(users.name, `%${filters.search.trim()}%`),
        ilike(users.email, `%${filters.search.trim()}%`),
        ilike(clinicalReviewerProfiles.specialty, `%${filters.search.trim()}%`),
      )!,
    )
  if (filters.professionalRole)
    conditions.push(eq(clinicalReviewerProfiles.professionalRole, filters.professionalRole))
  if (filters.verificationStatus)
    conditions.push(eq(clinicalReviewerProfiles.verificationStatus, filters.verificationStatus))
  if (filters.active)
    conditions.push(eq(clinicalReviewerProfiles.isActive, filters.active === 'active'))
  if (filters.capability)
    conditions.push(
      sql`exists (select 1 from ${clinicalReviewerCapabilities} c where c.reviewer_user_id = ${clinicalReviewerProfiles.userId} and c.capability = ${filters.capability})`,
    )
  const where = conditions.length ? and(...conditions) : undefined
  const activeAssignments = sql<number>`(select count(*)::int from ${clinicalReviewAssignments} a where a.reviewer_user_id = ${clinicalReviewerProfiles.userId} and a.status in ('assigned','in_progress'))`
  const completedReviews = sql<number>`(select count(*)::int from ${clinicalReviewDecisions} d where d.reviewer_user_id = ${clinicalReviewerProfiles.userId} and d.is_draft = false)`
  const lastActivity = sql<Date>`greatest(${clinicalReviewerProfiles.updatedAt}, coalesce((select max(a.assigned_at) from ${clinicalReviewAssignments} a where a.reviewer_user_id = ${clinicalReviewerProfiles.userId}), ${clinicalReviewerProfiles.updatedAt}), coalesce((select max(d.created_at) from ${clinicalReviewDecisions} d where d.reviewer_user_id = ${clinicalReviewerProfiles.userId}), ${clinicalReviewerProfiles.updatedAt}))`
  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        userId: users.id,
        userName: users.name,
        userEmail: users.email,
        professionalRole: clinicalReviewerProfiles.professionalRole,
        specialty: clinicalReviewerProfiles.specialty,
        verificationStatus: clinicalReviewerProfiles.verificationStatus,
        verifiedAt: clinicalReviewerProfiles.verifiedAt,
        isActive: clinicalReviewerProfiles.isActive,
        canPublish: clinicalReviewerProfiles.canPublish,
        activeAssignments,
        completedReviews,
        lastActivity,
        createdAt: clinicalReviewerProfiles.createdAt,
      })
      .from(clinicalReviewerProfiles)
      .innerJoin(users, eq(users.id, clinicalReviewerProfiles.userId))
      .where(where)
      .orderBy(asc(users.name))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ total: count() })
      .from(clinicalReviewerProfiles)
      .innerJoin(users, eq(users.id, clinicalReviewerProfiles.userId))
      .where(where),
  ])
  const ids = rows.map((r) => r.userId)
  const caps = ids.length
    ? await db
        .select({
          userId: clinicalReviewerCapabilities.reviewerUserId,
          capability: clinicalReviewerCapabilities.capability,
        })
        .from(clinicalReviewerCapabilities)
        .where(inArray(clinicalReviewerCapabilities.reviewerUserId, ids))
    : []
  return {
    rows: rows.map((row) => ({
      ...row,
      capabilities: caps
        .filter((c) => c.userId === row.userId)
        .map((c) => c.capability as ClinicalReviewerCapability),
    })),
    total: totalRow?.total ?? 0,
    page,
    pageSize,
  }
}

export async function getReviewerForPlatform(db: Database, userId: string) {
  const [profile] = await db
    .select({
      userId: users.id,
      userName: users.name,
      userEmail: users.email,
      professionalRole: clinicalReviewerProfiles.professionalRole,
      specialty: clinicalReviewerProfiles.specialty,
      verificationStatus: clinicalReviewerProfiles.verificationStatus,
      verifiedAt: clinicalReviewerProfiles.verifiedAt,
      verifiedBy: clinicalReviewerProfiles.verifiedBy,
      isActive: clinicalReviewerProfiles.isActive,
      canPublish: clinicalReviewerProfiles.canPublish,
      createdAt: clinicalReviewerProfiles.createdAt,
      updatedAt: clinicalReviewerProfiles.updatedAt,
    })
    .from(clinicalReviewerProfiles)
    .innerJoin(users, eq(users.id, clinicalReviewerProfiles.userId))
    .where(eq(users.id, userId))
    .limit(1)
  if (!profile) return null
  const [caps, assignments, decisions] = await Promise.all([
    db
      .select({ capability: clinicalReviewerCapabilities.capability })
      .from(clinicalReviewerCapabilities)
      .where(eq(clinicalReviewerCapabilities.reviewerUserId, userId)),
    db
      .select({
        id: clinicalReviewAssignments.id,
        taskId: clinicalReviewAssignments.taskId,
        assignmentRole: clinicalReviewAssignments.assignmentRole,
        status: clinicalReviewAssignments.status,
        assignedAt: clinicalReviewAssignments.assignedAt,
        taskStatus: clinicalReviewTasks.status,
        reviewPriority: clinicalReviewTasks.reviewPriority,
        requiredCapability: clinicalReviewTasks.requiredCapability,
        subjectType: clinicalReviewTasks.subjectType,
        targetKey: clinicalReviewTasks.targetKey,
      })
      .from(clinicalReviewAssignments)
      .innerJoin(clinicalReviewTasks, eq(clinicalReviewTasks.id, clinicalReviewAssignments.taskId))
      .where(eq(clinicalReviewAssignments.reviewerUserId, userId))
      .orderBy(desc(clinicalReviewAssignments.assignedAt)),
    db
      .select({
        id: clinicalReviewDecisions.id,
        taskId: clinicalReviewDecisions.taskId,
        decision: clinicalReviewDecisions.decision,
        severity: clinicalReviewDecisions.severity,
        evidenceStrength: clinicalReviewDecisions.evidenceStrength,
        reviewNote: clinicalReviewDecisions.reviewNote,
        createdAt: clinicalReviewDecisions.createdAt,
        updatedAt: clinicalReviewDecisions.updatedAt,
      })
      .from(clinicalReviewDecisions)
      .where(
        and(
          eq(clinicalReviewDecisions.reviewerUserId, userId),
          eq(clinicalReviewDecisions.isDraft, false),
        ),
      )
      .orderBy(desc(clinicalReviewDecisions.updatedAt)),
  ])
  return {
    ...profile,
    capabilities: caps.map((c) => c.capability as ClinicalReviewerCapability),
    assignments,
    decisions,
  }
}

const REVIEWER_TRANSITIONS: Record<
  ClinicalReviewerVerificationStatus,
  readonly ClinicalReviewerVerificationStatus[]
> = {
  pending: ['verified', 'rejected'],
  verified: ['suspended'],
  suspended: ['verified'],
  rejected: ['pending'],
}
const REVIEWER_EVENTS: Record<string, typeof clinicalReviewAuditLog.$inferInsert.eventType> = {
  'pending:verified': 'reviewer_verified',
  'pending:rejected': 'reviewer_rejected',
  'verified:suspended': 'reviewer_suspended',
  'suspended:verified': 'reviewer_reactivated',
  'rejected:pending': 'reviewer_reactivated',
}

export async function transitionReviewerStatusForPlatform(
  db: Database,
  input: {
    userId: string
    toStatus: ClinicalReviewerVerificationStatus
    reason?: string
    actorUserId: string
    platformStaffId: string
    ipAddress?: string | null
    userAgent?: string | null
    now?: Date
  },
) {
  const now = input.now ?? new Date()
  return db.transaction(async (tx) => {
    const [profile] = await tx
      .select({
        status: clinicalReviewerProfiles.verificationStatus,
        isActive: clinicalReviewerProfiles.isActive,
        verifiedAt: clinicalReviewerProfiles.verifiedAt,
        verifiedBy: clinicalReviewerProfiles.verifiedBy,
      })
      .from(clinicalReviewerProfiles)
      .where(eq(clinicalReviewerProfiles.userId, input.userId))
      .limit(1)
      .for('update')
    if (!profile) throw new ClinicalReviewerOperationError('not_found', 'Hakem bulunamadı.')
    const from = profile.status as ClinicalReviewerVerificationStatus
    if (!REVIEWER_TRANSITIONS[from].includes(input.toStatus))
      throw new ClinicalReviewerOperationError(
        'invalid_transition',
        `${from} → ${input.toStatus} geçişine izin verilmiyor.`,
      )
    if (
      (input.toStatus === 'rejected' || input.toStatus === 'suspended') &&
      (input.reason?.trim().length ?? 0) < 3
    )
      throw new Error('Bu durum değişikliği için neden zorunludur.')
    const active = input.toStatus === 'verified'
    const verified = input.toStatus === 'verified'
    const retainVerification = input.toStatus === 'suspended'
    await tx
      .update(clinicalReviewerProfiles)
      .set({
        verificationStatus: input.toStatus,
        isActive: active,
        verifiedAt: verified ? now : retainVerification ? profile.verifiedAt : null,
        verifiedBy: verified ? input.actorUserId : retainVerification ? profile.verifiedBy : null,
        updatedAt: now,
      })
      .where(eq(clinicalReviewerProfiles.userId, input.userId))
    const eventType = REVIEWER_EVENTS[`${from}:${input.toStatus}`]!
    await tx.insert(clinicalReviewAuditLog).values(
      clinicalAuditValues({
        actorUserId: input.actorUserId,
        eventType,
        fromStatus: from,
        toStatus: input.toStatus,
        summary: `Reviewer durumu ${from} → ${input.toStatus} olarak değiştirildi.${input.reason ? ` Neden: ${input.reason.trim()}` : ''}`,
      }),
    )
    await tx.insert(platformAuditLogs).values(
      platformAuditValues({
        ...input,
        action: `clinical.reviewer.${input.toStatus === 'verified' && from === 'suspended' ? 'reactivated' : input.toStatus}`,
        entityType: 'clinical_reviewer',
        entityId: input.userId,
        metadata: { fromStatus: from, toStatus: input.toStatus, reason: input.reason?.trim() },
      }),
    )
    return { fromStatus: from, toStatus: input.toStatus, isActive: active }
  })
}

export async function updateReviewerCapabilitiesForPlatform(
  db: Database,
  input: {
    userId: string
    capabilities: ClinicalReviewerCapability[]
    actorUserId: string
    platformStaffId: string
    ipAddress?: string | null
    userAgent?: string | null
    now?: Date
  },
) {
  const now = input.now ?? new Date()
  const capabilities = [...new Set(input.capabilities)]
  return db.transaction(async (tx) => {
    const [profile] = await tx
      .select({ userId: clinicalReviewerProfiles.userId })
      .from(clinicalReviewerProfiles)
      .where(eq(clinicalReviewerProfiles.userId, input.userId))
      .limit(1)
      .for('update')
    if (!profile) throw new ClinicalReviewerOperationError('not_found', 'Hakem bulunamadı.')
    await tx
      .delete(clinicalReviewerCapabilities)
      .where(eq(clinicalReviewerCapabilities.reviewerUserId, input.userId))
    if (capabilities.length)
      await tx
        .insert(clinicalReviewerCapabilities)
        .values(capabilities.map((capability) => ({ reviewerUserId: input.userId, capability })))
    const [incompatible] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(clinicalReviewAssignments)
      .innerJoin(clinicalReviewTasks, eq(clinicalReviewTasks.id, clinicalReviewAssignments.taskId))
      .where(
        and(
          eq(clinicalReviewAssignments.reviewerUserId, input.userId),
          inArray(clinicalReviewAssignments.status, ['assigned', 'in_progress']),
          sql`not (${clinicalReviewTasks.requiredCapability} = any(${capabilities}::text[]) or ${'general_clinical'} = any(${capabilities}::text[]))`,
        ),
      )
    await tx.insert(clinicalReviewAuditLog).values(
      clinicalAuditValues({
        actorUserId: input.actorUserId,
        eventType: 'reviewer_capabilities_changed',
        summary: `Reviewer yetkinlikleri değiştirildi; ${incompatible?.count ?? 0} aktif atama artık uyumsuz.`,
      }),
    )
    await tx.insert(platformAuditLogs).values(
      platformAuditValues({
        ...input,
        action: 'clinical.reviewer.capabilities_changed',
        entityType: 'clinical_reviewer',
        entityId: input.userId,
        metadata: { capabilities, incompatibleAssignmentCount: incompatible?.count ?? 0 },
      }),
    )
    return { incompatibleAssignmentCount: incompatible?.count ?? 0 }
  })
}

export async function assignTaskToReviewerForPlatform(
  db: Database,
  input: {
    taskId: string
    reviewerUserId: string
    assignmentRole: ClinicalAssignmentRole
    actorUserId: string
    platformStaffId: string
    validate: ClinicalTaskEligibilityValidator
    ipAddress?: string | null
    userAgent?: string | null
    now?: Date
  },
) {
  const now = input.now ?? new Date()
  return db.transaction(async (tx) => {
    const [task] = await tx
      .select({
        id: clinicalReviewTasks.id,
        status: clinicalReviewTasks.status,
        version: clinicalReviewTasks.version,
        subjectType: clinicalReviewTasks.subjectType,
        targetType: clinicalReviewTasks.targetType,
        action: clinicalReviewTasks.action,
        requiredCapability: clinicalReviewTasks.requiredCapability,
      })
      .from(clinicalReviewTasks)
      .where(eq(clinicalReviewTasks.id, input.taskId))
      .limit(1)
      .for('update')
    if (!task) throw new ClinicalReviewerOperationError('not_found', 'Görev bulunamadı.')
    const [reviewer] = await tx
      .select({
        professionalRole: clinicalReviewerProfiles.professionalRole,
        verificationStatus: clinicalReviewerProfiles.verificationStatus,
        isActive: clinicalReviewerProfiles.isActive,
      })
      .from(clinicalReviewerProfiles)
      .where(eq(clinicalReviewerProfiles.userId, input.reviewerUserId))
      .limit(1)
      .for('update')
    if (!reviewer || reviewer.verificationStatus !== 'verified' || !reviewer.isActive)
      throw new ClinicalReviewerOperationError('ineligible', 'Hakem doğrulanmış ve aktif değil.')
    const capabilityRows = await tx
      .select({ capability: clinicalReviewerCapabilities.capability })
      .from(clinicalReviewerCapabilities)
      .where(eq(clinicalReviewerCapabilities.reviewerUserId, input.reviewerUserId))
    const eligible = input.validate(task as ClinicalTaskEligibilityInput, input.assignmentRole, {
      professionalRole: reviewer.professionalRole as ClinicalProfessionalRole,
      capabilities: capabilityRows.map((row) => row.capability as ClinicalReviewerCapability),
    })
    if (!eligible.eligible)
      throw new ClinicalReviewerOperationError(
        'ineligible',
        eligible.reason ?? 'Hakem bu görev için uygun değil.',
      )
    const [assignment] = await tx
      .insert(clinicalReviewAssignments)
      .values({
        id: `cra_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`,
        taskId: task.id,
        reviewerUserId: input.reviewerUserId,
        assignmentRole: input.assignmentRole,
        status: 'assigned',
        assignedAt: now,
        assignedBy: input.actorUserId,
      })
      .onConflictDoUpdate({
        target: [clinicalReviewAssignments.taskId, clinicalReviewAssignments.reviewerUserId],
        set: {
          assignmentRole: input.assignmentRole,
          status: 'assigned',
          assignedAt: now,
          assignedBy: input.actorUserId,
          startedAt: null,
          completedAt: null,
        },
      })
      .returning({ id: clinicalReviewAssignments.id })
    if (!assignment) throw new Error('Görev atanamadı.')
    if (task.status === 'pending')
      await tx
        .update(clinicalReviewTasks)
        .set({ status: 'assigned', version: task.version + 1, updatedAt: now })
        .where(
          and(eq(clinicalReviewTasks.id, task.id), eq(clinicalReviewTasks.version, task.version)),
        )
    await tx.insert(clinicalReviewAuditLog).values(
      clinicalAuditValues({
        taskId: task.id,
        actorUserId: input.actorUserId,
        eventType: 'task_assigned',
        fromStatus: task.status,
        toStatus: task.status === 'pending' ? 'assigned' : task.status,
        summary: `${input.reviewerUserId} hakemine ${input.assignmentRole} görevi atandı.`,
      }),
    )
    await tx.insert(platformAuditLogs).values(
      platformAuditValues({
        ...input,
        action: 'clinical.task.assigned',
        entityType: 'clinical_review_assignment',
        entityId: assignment.id,
        metadata: {
          taskId: task.id,
          reviewerUserId: input.reviewerUserId,
          assignmentRole: input.assignmentRole,
        },
      }),
    )
    return assignment
  })
}

export async function cancelReviewerAssignmentForPlatform(
  db: Database,
  input: {
    assignmentId: string
    reason: string
    actorUserId: string
    platformStaffId: string
    ipAddress?: string | null
    userAgent?: string | null
    now?: Date
  },
) {
  const now = input.now ?? new Date()
  if (input.reason.trim().length < 3) throw new Error('Atama iptal nedeni zorunludur.')
  return db.transaction(async (tx) => {
    const [assignment] = await tx
      .update(clinicalReviewAssignments)
      .set({ status: 'cancelled' })
      .where(
        and(
          eq(clinicalReviewAssignments.id, input.assignmentId),
          inArray(clinicalReviewAssignments.status, ['assigned', 'in_progress']),
        ),
      )
      .returning({
        id: clinicalReviewAssignments.id,
        taskId: clinicalReviewAssignments.taskId,
        reviewerUserId: clinicalReviewAssignments.reviewerUserId,
      })
    if (!assignment)
      throw new ClinicalReviewerOperationError('not_found', 'Aktif görev ataması bulunamadı.')
    const [remaining] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(clinicalReviewAssignments)
      .where(
        and(
          eq(clinicalReviewAssignments.taskId, assignment.taskId),
          inArray(clinicalReviewAssignments.status, ['assigned', 'in_progress']),
        ),
      )
    const [task] = await tx
      .select({ status: clinicalReviewTasks.status, version: clinicalReviewTasks.version })
      .from(clinicalReviewTasks)
      .where(eq(clinicalReviewTasks.id, assignment.taskId))
      .limit(1)
      .for('update')
    if ((remaining?.count ?? 0) === 0 && task?.status === 'assigned') {
      await tx
        .update(clinicalReviewTasks)
        .set({ status: 'pending', version: task.version + 1, updatedAt: now })
        .where(
          and(
            eq(clinicalReviewTasks.id, assignment.taskId),
            eq(clinicalReviewTasks.version, task.version),
          ),
        )
    }
    await tx.insert(clinicalReviewAuditLog).values(
      clinicalAuditValues({
        taskId: assignment.taskId,
        actorUserId: input.actorUserId,
        eventType: 'task_assignment_cancelled',
        fromStatus: task?.status,
        toStatus:
          (remaining?.count ?? 0) === 0 && task?.status === 'assigned' ? 'pending' : task?.status,
        summary: `${assignment.reviewerUserId} hakeminin görev ataması iptal edildi. Neden: ${input.reason.trim()}`,
      }),
    )
    await tx.insert(platformAuditLogs).values(
      platformAuditValues({
        ...input,
        action: 'clinical.task.assignment_cancelled',
        entityType: 'clinical_review_assignment',
        entityId: assignment.id,
        metadata: {
          taskId: assignment.taskId,
          reviewerUserId: assignment.reviewerUserId,
          reason: input.reason.trim(),
        },
      }),
    )
    return assignment
  })
}

export async function listClinicalTasksForPlatform(
  db: Database,
  filters: {
    search?: string
    priority?: string
    status?: string
    requiredCapability?: string
    subjectType?: string
    confidence?: string
    assignmentState?: 'assigned' | 'unassigned'
    reviewerUserId?: string
    page?: number
    pageSize?: 25 | 50 | 100
  } = {},
) {
  const page = Math.max(1, Math.trunc(filters.page ?? 1))
  const pageSize = ([25, 50, 100] as const).includes(filters.pageSize as 25 | 50 | 100)
    ? filters.pageSize!
    : 25
  const conditions: SQL[] = []
  if (filters.search?.trim())
    conditions.push(
      or(
        ilike(clinicalReviewTasks.candidateId, `%${filters.search.trim()}%`),
        ilike(clinicalReviewTasks.targetKey, `%${filters.search.trim()}%`),
      )!,
    )
  if (filters.priority) conditions.push(eq(clinicalReviewTasks.reviewPriority, filters.priority))
  if (filters.status) conditions.push(eq(clinicalReviewTasks.status, filters.status))
  if (filters.requiredCapability)
    conditions.push(eq(clinicalReviewTasks.requiredCapability, filters.requiredCapability))
  if (filters.subjectType) conditions.push(eq(clinicalReviewTasks.subjectType, filters.subjectType))
  if (filters.confidence)
    conditions.push(eq(clinicalReviewTasks.candidateConfidence, filters.confidence))
  if (filters.assignmentState === 'assigned')
    conditions.push(
      sql`exists (select 1 from ${clinicalReviewAssignments} a where a.task_id = ${clinicalReviewTasks.id} and a.status in ('assigned','in_progress'))`,
    )
  if (filters.assignmentState === 'unassigned')
    conditions.push(
      sql`not exists (select 1 from ${clinicalReviewAssignments} a where a.task_id = ${clinicalReviewTasks.id} and a.status in ('assigned','in_progress'))`,
    )
  if (filters.reviewerUserId?.trim())
    conditions.push(
      sql`exists (select 1 from ${clinicalReviewAssignments} a where a.task_id = ${clinicalReviewTasks.id} and a.reviewer_user_id = ${filters.reviewerUserId.trim()} and a.status in ('assigned','in_progress'))`,
    )
  const where = conditions.length ? and(...conditions) : undefined
  const assignmentCount = sql<number>`(select count(*)::int from ${clinicalReviewAssignments} a where a.task_id = ${clinicalReviewTasks.id} and a.status in ('assigned','in_progress'))`
  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: clinicalReviewTasks.id,
        candidateId: clinicalReviewTasks.candidateId,
        subjectType: clinicalReviewTasks.subjectType,
        targetType: clinicalReviewTasks.targetType,
        targetKey: clinicalReviewTasks.targetKey,
        action: clinicalReviewTasks.action,
        reviewPriority: clinicalReviewTasks.reviewPriority,
        requiredCapability: clinicalReviewTasks.requiredCapability,
        candidateConfidence: clinicalReviewTasks.candidateConfidence,
        status: clinicalReviewTasks.status,
        assignmentCount,
        createdAt: clinicalReviewTasks.createdAt,
      })
      .from(clinicalReviewTasks)
      .where(where)
      .orderBy(asc(clinicalReviewTasks.reviewPriority), desc(clinicalReviewTasks.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(clinicalReviewTasks).where(where),
  ])
  return { rows, total: totalRow?.total ?? 0, page, pageSize }
}

export async function listEligibleTasksForPlatform(
  db: Database,
  input: {
    validate: ClinicalTaskEligibilityValidator
    assignmentRole: ClinicalAssignmentRole
    search?: string
    priority?: string
    status?: string
    requiredCapability?: string
    subjectType?: string
    page?: number
    pageSize?: 25 | 50 | 100
  },
) {
  const candidates: Awaited<ReturnType<typeof listClinicalTasksForPlatform>>['rows'] = []
  let databasePage = 1
  while (true) {
    const batch = await listClinicalTasksForPlatform(db, {
      ...input,
      page: databasePage,
      pageSize: 100,
    })
    candidates.push(...batch.rows)
    if (databasePage * batch.pageSize >= batch.total) break
    databasePage += 1
  }
  const eligible = candidates.filter(
    (task) => input.validate(task as ClinicalTaskEligibilityInput, input.assignmentRole).eligible,
  )
  const page = Math.max(1, input.page ?? 1)
  const pageSize = input.pageSize ?? 25
  return {
    rows: eligible.slice((page - 1) * pageSize, page * pageSize),
    total: eligible.length,
    page,
    pageSize,
  }
}

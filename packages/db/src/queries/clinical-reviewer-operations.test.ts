import { createId } from '@paralleldrive/cuid2'
import { and, count, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from '../client'
import {
  clinicalReviewAssignments,
  clinicalReviewAuditLog,
  clinicalReviewerInvitationAssignments,
  clinicalReviewerInvitations,
  clinicalReviewerCapabilities,
  clinicalReviewerProfiles,
  clinicalReviewTasks,
  clinicalSources,
  medicationSubstances,
  platformAuditLogs,
  platformStaff,
  users,
} from '../schema'
import {
  clinicalReviewerInvitationExpiry,
  createClinicalReviewerInvitationToken,
  hashClinicalReviewerInvitationToken,
} from '../clinical-reviewer-invitation'
import {
  acceptReviewerInvitation,
  assignTaskToReviewerForPlatform,
  cancelReviewerAssignmentForPlatform,
  createReviewerInvitationForPlatform,
  getReviewerInvitationForPlatform,
  getReviewerInvitationPreviewByTokenHash,
  revokeReviewerInvitationForPlatform,
  rotateReviewerInvitationTokenForPlatform,
  stageReviewerInvitationAssignmentsForPlatform,
  updateReviewerInvitationCapabilitiesForPlatform,
  type ClinicalTaskEligibilityValidator,
} from './clinical-reviewer-operations'

const describeWithDb = process.env.CLINICAL_REVIEWER_WRITE_TESTS === '1' ? describe : describe.skip
const validator: ClinicalTaskEligibilityValidator = (task, _role, reviewer) => {
  if (['published', 'rejected', 'approved', 'ready_to_publish'].includes(task.status))
    return { eligible: false, reason: 'terminal' }
  const capabilities = reviewer?.capabilities ?? ['medication_food']
  return capabilities.includes(task.requiredCapability as 'medication_food') ||
    capabilities.includes('general_clinical')
    ? { eligible: true }
    : { eligible: false, reason: 'capability' }
}

async function fixture() {
  const suffix = createId()
  const staffUserId = `cr-staff-user-${suffix}`
  const staffId = `cr-staff-${suffix}`
  const reviewerUserId = `cr-reviewer-${suffix}`
  const email = `${reviewerUserId}@test.invalid`
  const sourceId = `cr-source-${suffix}`
  const substanceId = `cr-substance-${suffix}`
  await db.insert(users).values([
    { id: staffUserId, email: `${staffUserId}@test.invalid`, name: 'Clinical Ops' },
    { id: reviewerUserId, email, name: 'Reviewer' },
  ])
  await db.insert(platformStaff).values({ id: staffId, userId: staffUserId, role: 'clinical_ops' })
  await db.insert(clinicalSources).values({ id: sourceId, code: sourceId, name: 'Test source' })
  await db.insert(medicationSubstances).values({
    id: substanceId,
    nameTr: 'Test',
    normalizedName: substanceId,
    searchText: 'test',
    sourceId,
    mappingMethod: 'manual',
  })
  return { suffix, staffUserId, staffId, reviewerUserId, email, sourceId, substanceId }
}
async function task(
  f: Awaited<ReturnType<typeof fixture>>,
  status = 'pending',
  capability = 'medication_food',
) {
  const id = `cr-task-${createId()}`
  await db.insert(clinicalReviewTasks).values({
    id,
    sourceSystem: 'test',
    candidateId: `candidate-${id}`,
    candidateSemanticHash: `hash-${id}`,
    subjectType: 'medication',
    medicationSubstanceId: f.substanceId,
    targetType: 'food',
    targetKey: 'test_food',
    action: 'caution',
    candidateConfidence: 'high',
    reviewPriority: 'P1',
    requiredCapability: capability,
    status,
    artifactLocator: `artifact://${id}`,
  })
  return id
}
async function invitation(
  f: Awaited<ReturnType<typeof fixture>>,
  options: {
    token?: string
    preverified?: boolean
    email?: string
    capabilities?: ('medication_food' | 'condition_food')[]
  } = {},
) {
  const token = options.token ?? createClinicalReviewerInvitationToken()
  const now = new Date()
  const row = await createReviewerInvitationForPlatform(db, {
    email: options.email ?? f.email,
    name: 'Reviewer',
    professionalRole: 'pharmacist',
    specialty: 'Clinical Pharmacy',
    capabilities: options.capabilities ?? ['medication_food'],
    professionalVerificationConfirmed: options.preverified ?? true,
    tokenHash: hashClinicalReviewerInvitationToken(token),
    expiresAt: clinicalReviewerInvitationExpiry(now),
    actorUserId: f.staffUserId,
    platformStaffId: f.staffId,
    now,
  })
  return { ...row, token }
}
const actor = (f: Awaited<ReturnType<typeof fixture>>) => ({
  actorUserId: f.staffUserId,
  platformStaffId: f.staffId,
})

describe('clinical reviewer invitation token primitives', () => {
  it('creates 32-byte opaque tokens and stable SHA-256 hashes', () => {
    const token = createClinicalReviewerInvitationToken()
    expect(Buffer.from(token, 'base64url')).toHaveLength(32)
    expect(hashClinicalReviewerInvitationToken(token)).toMatch(/^[a-f0-9]{64}$/)
    expect(hashClinicalReviewerInvitationToken(token)).not.toContain(token)
  })
})

describeWithDb('clinical reviewer operations integration', () => {
  it('serializes duplicate valid invitations and never selects token hashes for admin', async () => {
    const f = await fixture()
    const tokenA = createClinicalReviewerInvitationToken()
    const tokenB = createClinicalReviewerInvitationToken()
    const base = {
      email: f.email,
      name: 'Reviewer',
      professionalRole: 'pharmacist' as const,
      specialty: null,
      capabilities: ['medication_food'] as const,
      professionalVerificationConfirmed: true,
      expiresAt: clinicalReviewerInvitationExpiry(),
      ...actor(f),
    }
    const results = await Promise.allSettled([
      createReviewerInvitationForPlatform(db, {
        ...base,
        capabilities: [...base.capabilities],
        tokenHash: hashClinicalReviewerInvitationToken(tokenA),
      }),
      createReviewerInvitationForPlatform(db, {
        ...base,
        capabilities: [...base.capabilities],
        tokenHash: hashClinicalReviewerInvitationToken(tokenB),
      }),
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const id = (
      results.find((result) => result.status === 'fulfilled') as PromiseFulfilledResult<{
        id: string
      }>
    ).value.id
    expect(await getReviewerInvitationForPlatform(db, id)).not.toHaveProperty('tokenHash')
  })

  it('accepts once, materializes eligible staging, invalidates terminal tasks and writes both audit domains', async () => {
    const f = await fixture()
    const invite = await invitation(f)
    const eligibleTask = await task(f)
    const terminalTask = await task(f)
    await stageReviewerInvitationAssignmentsForPlatform(db, {
      invitationId: invite.id,
      taskIds: [eligibleTask, terminalTask],
      assignmentRole: 'primary',
      validate: validator,
      ...actor(f),
    })
    await db
      .update(clinicalReviewTasks)
      .set({ status: 'published' })
      .where(eq(clinicalReviewTasks.id, terminalTask))
    const attempts = await Promise.allSettled([
      acceptReviewerInvitation(db, {
        tokenHash: hashClinicalReviewerInvitationToken(invite.token),
        userId: f.reviewerUserId,
        userEmail: f.email,
        validate: validator,
      }),
      acceptReviewerInvitation(db, {
        tokenHash: hashClinicalReviewerInvitationToken(invite.token),
        userId: f.reviewerUserId,
        userEmail: f.email,
        validate: validator,
      }),
    ])
    expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(
      (
        await db
          .select({ emailVerified: users.emailVerified })
          .from(users)
          .where(eq(users.id, f.reviewerUserId))
      )[0]?.emailVerified,
    ).toBe(true)
    expect(
      (
        await db
          .select()
          .from(clinicalReviewerProfiles)
          .where(eq(clinicalReviewerProfiles.userId, f.reviewerUserId))
      )[0],
    ).toMatchObject({ verificationStatus: 'verified', isActive: true, verifiedBy: f.staffUserId })
    expect(
      await db
        .select({ value: count() })
        .from(clinicalReviewAssignments)
        .where(eq(clinicalReviewAssignments.reviewerUserId, f.reviewerUserId)),
    ).toEqual([{ value: 1 }])
    const staged = await db
      .select({
        taskId: clinicalReviewerInvitationAssignments.taskId,
        status: clinicalReviewerInvitationAssignments.status,
      })
      .from(clinicalReviewerInvitationAssignments)
      .where(eq(clinicalReviewerInvitationAssignments.invitationId, invite.id))
    expect(staged).toEqual(
      expect.arrayContaining([
        { taskId: eligibleTask, status: 'materialized' },
        { taskId: terminalTask, status: 'invalidated' },
      ]),
    )
    expect(
      await db
        .select({ value: count() })
        .from(clinicalReviewAuditLog)
        .where(eq(clinicalReviewAuditLog.eventType, 'reviewer_invite_accepted')),
    ).not.toEqual([{ value: 0 }])
    expect(
      await db
        .select({ value: count() })
        .from(platformAuditLogs)
        .where(
          and(
            eq(platformAuditLogs.entityId, invite.id),
            eq(platformAuditLogs.action, 'clinical.task.preassigned'),
          ),
        ),
    ).toEqual([{ value: 1 }])
  })

  it('keeps account activation separate from professional verification and blocks wrong email', async () => {
    const f = await fixture()
    const invite = await invitation(f, { preverified: false })
    await expect(
      acceptReviewerInvitation(db, {
        tokenHash: hashClinicalReviewerInvitationToken(invite.token),
        userId: f.reviewerUserId,
        userEmail: 'wrong@test.invalid',
        validate: validator,
      }),
    ).rejects.toThrow('yalnızca davet edilen')
    await acceptReviewerInvitation(db, {
      tokenHash: hashClinicalReviewerInvitationToken(invite.token),
      userId: f.reviewerUserId,
      userEmail: f.email.toUpperCase(),
      validate: validator,
    })
    expect(
      (
        await db
          .select()
          .from(clinicalReviewerProfiles)
          .where(eq(clinicalReviewerProfiles.userId, f.reviewerUserId))
      )[0],
    ).toMatchObject({
      verificationStatus: 'pending',
      isActive: false,
      verifiedAt: null,
      verifiedBy: null,
    })
  })

  it('does not overwrite an existing reviewer lifecycle through invitation creation or acceptance', async () => {
    const accepting = await fixture()
    const invite = await invitation(accepting)
    await db.insert(clinicalReviewerProfiles).values({
      userId: accepting.reviewerUserId,
      professionalRole: 'physician',
      verificationStatus: 'pending',
      isActive: false,
    })
    await expect(
      acceptReviewerInvitation(db, {
        tokenHash: hashClinicalReviewerInvitationToken(invite.token),
        userId: accepting.reviewerUserId,
        userEmail: accepting.email,
        validate: validator,
      }),
    ).rejects.toThrow('zaten clinical reviewer')
    expect(
      (
        await db
          .select({ status: clinicalReviewerInvitations.status })
          .from(clinicalReviewerInvitations)
          .where(eq(clinicalReviewerInvitations.id, invite.id))
      )[0]?.status,
    ).toBe('pending')

    const suspended = await fixture()
    await db.insert(clinicalReviewerProfiles).values({
      userId: suspended.reviewerUserId,
      professionalRole: 'pharmacist',
      verificationStatus: 'suspended',
      isActive: false,
    })
    await expect(invitation(suspended)).rejects.toThrow('zaten clinical reviewer')
  })

  it('invalidates the old token on resend and enforces cooldown', async () => {
    const f = await fixture()
    const invite = await invitation(f)
    const newToken = createClinicalReviewerInvitationToken()
    const afterCooldown = new Date(Date.now() + 61_000)
    await rotateReviewerInvitationTokenForPlatform(db, {
      invitationId: invite.id,
      tokenHash: hashClinicalReviewerInvitationToken(newToken),
      expiresAt: clinicalReviewerInvitationExpiry(afterCooldown),
      cooldownMs: 60_000,
      ...actor(f),
      now: afterCooldown,
    })
    expect(
      await getReviewerInvitationPreviewByTokenHash(
        db,
        hashClinicalReviewerInvitationToken(invite.token),
      ),
    ).toBeNull()
    await expect(
      rotateReviewerInvitationTokenForPlatform(db, {
        invitationId: invite.id,
        tokenHash: hashClinicalReviewerInvitationToken(createClinicalReviewerInvitationToken()),
        expiresAt: clinicalReviewerInvitationExpiry(),
        cooldownMs: 60_000,
        ...actor(f),
        now: new Date(afterCooldown.getTime() + 1_000),
      }),
    ).rejects.toThrow('60 saniyede')
    await acceptReviewerInvitation(db, {
      tokenHash: hashClinicalReviewerInvitationToken(newToken),
      userId: f.reviewerUserId,
      userEmail: f.email,
      validate: validator,
      now: afterCooldown,
    })
  })

  it('rejects expired, revoked and random tokens without exposing token hashes', async () => {
    const f = await fixture()
    const expiredToken = createClinicalReviewerInvitationToken()
    await createReviewerInvitationForPlatform(db, {
      email: f.email,
      name: 'Reviewer',
      professionalRole: 'pharmacist',
      specialty: null,
      capabilities: ['medication_food'],
      professionalVerificationConfirmed: true,
      tokenHash: hashClinicalReviewerInvitationToken(expiredToken),
      expiresAt: new Date(Date.now() - 1_000),
      ...actor(f),
    })
    await expect(
      acceptReviewerInvitation(db, {
        tokenHash: hashClinicalReviewerInvitationToken(expiredToken),
        userId: f.reviewerUserId,
        userEmail: f.email,
        validate: validator,
      }),
    ).rejects.toThrow('süresi dolmuş')

    const revokedInvite = await invitation(f)
    await revokeReviewerInvitationForPlatform(db, {
      invitationId: revokedInvite.id,
      reason: 'Test iptali',
      ...actor(f),
    })
    const revokedPreview = await getReviewerInvitationPreviewByTokenHash(
      db,
      hashClinicalReviewerInvitationToken(revokedInvite.token),
    )
    expect(revokedPreview).toMatchObject({ displayStatus: 'revoked' })
    expect(revokedPreview).not.toHaveProperty('tokenHash')
    await expect(
      acceptReviewerInvitation(db, {
        tokenHash: hashClinicalReviewerInvitationToken(revokedInvite.token),
        userId: f.reviewerUserId,
        userEmail: f.email,
        validate: validator,
      }),
    ).rejects.toThrow('iptal edilmiş')

    const randomHash = hashClinicalReviewerInvitationToken(createClinicalReviewerInvitationToken())
    expect(await getReviewerInvitationPreviewByTokenHash(db, randomHash)).toBeNull()
    await expect(
      acceptReviewerInvitation(db, {
        tokenHash: randomHash,
        userId: f.reviewerUserId,
        userEmail: f.email,
        validate: validator,
      }),
    ).rejects.toThrow('geçersiz')
  })

  it('serializes revoke versus accept so exactly one terminal outcome wins', async () => {
    const f = await fixture()
    const invite = await invitation(f)
    const outcomes = await Promise.allSettled([
      revokeReviewerInvitationForPlatform(db, {
        invitationId: invite.id,
        reason: 'Yetkinlik belgesi geri çekildi',
        ...actor(f),
      }),
      acceptReviewerInvitation(db, {
        tokenHash: hashClinicalReviewerInvitationToken(invite.token),
        userId: f.reviewerUserId,
        userEmail: f.email,
        validate: validator,
      }),
    ])
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const [row] = await db
      .select({ status: clinicalReviewerInvitations.status })
      .from(clinicalReviewerInvitations)
      .where(eq(clinicalReviewerInvitations.id, invite.id))
    expect(['accepted', 'revoked']).toContain(row?.status)
  })

  it('revalidates staged tasks after capability changes and preserves cancelled assignment history', async () => {
    const f = await fixture()
    const invite = await invitation(f)
    const taskId = await task(f)
    await stageReviewerInvitationAssignmentsForPlatform(db, {
      invitationId: invite.id,
      taskIds: [taskId],
      assignmentRole: 'primary',
      validate: validator,
      ...actor(f),
    })
    const updated = await updateReviewerInvitationCapabilitiesForPlatform(db, {
      invitationId: invite.id,
      capabilities: ['condition_food'],
      validate: validator,
      ...actor(f),
    })
    expect(updated.invalidatedCount).toBe(1)
    await db.insert(clinicalReviewerProfiles).values({
      userId: f.reviewerUserId,
      professionalRole: 'pharmacist',
      verificationStatus: 'verified',
      isActive: true,
    })
    await db
      .insert(clinicalReviewerCapabilities)
      .values({ reviewerUserId: f.reviewerUserId, capability: 'medication_food' })
    const assigned = await Promise.all([
      assignTaskToReviewerForPlatform(db, {
        taskId,
        reviewerUserId: f.reviewerUserId,
        assignmentRole: 'primary',
        validate: validator,
        ...actor(f),
      }),
      assignTaskToReviewerForPlatform(db, {
        taskId,
        reviewerUserId: f.reviewerUserId,
        assignmentRole: 'primary',
        validate: validator,
        ...actor(f),
      }),
    ])
    expect(new Set(assigned.map((value) => value.id))).toHaveLength(1)
    await cancelReviewerAssignmentForPlatform(db, {
      assignmentId: assigned[0]!.id,
      reason: 'Operasyonel yeniden atama',
      ...actor(f),
    })
    expect(
      (
        await db
          .select({ status: clinicalReviewAssignments.status })
          .from(clinicalReviewAssignments)
          .where(eq(clinicalReviewAssignments.id, assigned[0]!.id))
      )[0]?.status,
    ).toBe('cancelled')
  })
})

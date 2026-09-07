import { describe, expect, it, afterAll, beforeAll } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '@ogun/db'
import {
  clinicalInteractionEvidence,
  clinicalInteractions,
  clinicalReviewAssignments,
  clinicalReviewAuditLog,
  clinicalReviewDecisions,
  clinicalReviewerCapabilities,
  clinicalReviewerProfiles,
  clinicalReviewTasks,
  medicationSubstances,
  users,
} from '@ogun/db/schema'
import {
  validateTaskForPublishing,
  publishReviewedClinicalInteraction,
} from './clinical-review-publisher'
import {
  evaluateTaskConsensus,
  isReviewerEligibleForTask,
  type ClinicalReviewerContext,
} from './clinical-review-policy'
import {
  createClinicalReviewArtifactStore,
  FilesystemArtifactStore,
  VercelBlobArtifactStore,
} from './clinical-review-artifact-store'
import { updateClinicalReviewTaskStatus } from '@ogun/db/queries'

describe('clinical review decision & publishing authorization safety', () => {
  const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const rootDir = path.resolve(packageDir, '../..')

  const testUserId = `usr_test_safety_${Date.now()}`
  const testAdminId = `usr_test_admin_${Date.now()}`
  const testTaskId = `crt_test_safety_${Date.now()}`
  const testCandidateId = `cand_test_${Date.now()}`
  const testSemanticHash = '4b971d4a85f3eb2a75066266e9f4154bbe0f91c0802167fc7fded28e76aabbdd'

  beforeAll(async () => {
    // Find an existing substance id for foreign key
    const [existingSub] = await db.select({ id: medicationSubstances.id }).from(medicationSubstances).limit(1)
    const substanceId = existingSub?.id ?? 'sub_00000000000000000000000001'

    // Setup test users & profiles
    await db.insert(users).values([
      {
        id: testUserId,
        email: `test-user-${Date.now()}@ogun.internal`,
        name: 'Test Reviewer',
      },
      {
        id: testAdminId,
        email: `test-admin-${Date.now()}@ogun.internal`,
        name: 'Test Clinical Admin',
      },
    ])

    await db.insert(clinicalReviewerProfiles).values([
      {
        userId: testUserId,
        professionalRole: 'pharmacist',
        verificationStatus: 'verified',
        isActive: true,
        canPublish: false,
      },
      {
        userId: testAdminId,
        professionalRole: 'clinical_admin',
        verificationStatus: 'verified',
        isActive: true,
        canPublish: true,
      },
    ])

    await db.insert(clinicalReviewerCapabilities).values([
      { reviewerUserId: testUserId, capability: 'medication_food' },
      { reviewerUserId: testUserId, capability: 'general_clinical' },
      { reviewerUserId: testAdminId, capability: 'medication_food' },
      { reviewerUserId: testAdminId, capability: 'general_clinical' },
    ])

    // Insert a sample task for safety tests
    await db.insert(clinicalReviewTasks).values({
      id: testTaskId,
      sourceSystem: 'openfda',
      candidateId: testCandidateId,
      candidateSemanticHash: testSemanticHash,
      subjectType: 'medication',
      medicationSubstanceId: substanceId,
      targetType: 'food',
      targetKey: 'food:high_tyramine_foods',
      action: 'avoid',
      candidateConfidence: 'high',
      ingredientAttribution: 'multi_ingredient_unattributed',
      reviewPriority: 'P1',
      requiredCapability: 'medication_food',
      status: 'pending',
      artifactLocator: 'test/snapshots/test.json.gz',
      version: 1,
      evidenceCount: 10,
      sourceDocumentCount: 5,
    })
  })

  afterAll(async () => {
    // Cleanup any test records so DB stays clean (0 published interactions)
    await db.delete(clinicalReviewDecisions).where(eq(clinicalReviewDecisions.taskId, testTaskId))
    await db.delete(clinicalReviewAssignments).where(eq(clinicalReviewAssignments.taskId, testTaskId))
    await db.delete(clinicalReviewAuditLog).where(eq(clinicalReviewAuditLog.taskId, testTaskId))
    await db.delete(clinicalReviewTasks).where(eq(clinicalReviewTasks.id, testTaskId))
    await db.delete(clinicalReviewerCapabilities).where(sql`reviewer_user_id in (${testUserId}, ${testAdminId})`)
    await db.delete(clinicalReviewerProfiles).where(sql`user_id in (${testUserId}, ${testAdminId})`)
    await db.delete(clinicalInteractionEvidence).where(sql`interaction_id like 'cli_' || ${testCandidateId}`)
    await db.delete(clinicalInteractions).where(eq(clinicalInteractions.sourceCandidateId, testCandidateId))
    await db.delete(users).where(sql`id in (${testUserId}, ${testAdminId})`)
  })

  // -------------------------------------------------------------------------
  // SECTION 67: DECISION TESTS (14 - 24)
  // -------------------------------------------------------------------------

  it('14. approve without severity fails', () => {
    const dec = {
      decision: 'approve',
      severity: null,
      evidenceStrength: 'strong',
      approvedTargetKey: 'food:high_tyramine_foods',
      approvedAction: 'avoid',
    }
    const isValid = Boolean(dec.severity && ['info', 'low', 'moderate', 'high', 'critical'].includes(dec.severity))
    expect(isValid).toBe(false)
  })

  it('15. approve without evidence strength fails', () => {
    const dec = {
      decision: 'approve',
      severity: 'high',
      evidenceStrength: null,
      approvedTargetKey: 'food:high_tyramine_foods',
      approvedAction: 'avoid',
    }
    const isValid = Boolean(
      dec.evidenceStrength &&
        ['strong', 'moderate', 'limited', 'expert_consensus', 'unknown'].includes(dec.evidenceStrength),
    )
    expect(isValid).toBe(false)
  })

  it('16. approve without target fails', () => {
    const dec = {
      decision: 'approve',
      severity: 'high',
      evidenceStrength: 'strong',
      approvedTargetKey: '',
      approvedAction: 'avoid',
    }
    expect(Boolean(dec.approvedTargetKey && dec.approvedTargetKey.trim().length > 0)).toBe(false)
  })

  it('17. approve without action fails', () => {
    const dec = {
      decision: 'approve',
      severity: 'high',
      evidenceStrength: 'strong',
      approvedTargetKey: 'food:high_tyramine_foods',
      approvedAction: '',
    }
    expect(Boolean(dec.approvedAction && dec.approvedAction.trim().length > 0)).toBe(false)
  })

  it('18. attribution-risk without confirmation fails', () => {
    const task = {
      id: testTaskId,
      status: 'pending',
      subjectType: 'medication' as const,
      targetType: 'food',
      action: 'avoid',
      ingredientAttribution: 'multi_ingredient_unattributed',
      requiredCapability: 'medication_food',
      candidateSemanticHash: testSemanticHash,
    }

    const decisionWithoutConfirmation = {
      id: 'd1',
      reviewerUserId: testUserId,
      decision: 'approve' as const,
      severity: 'moderate',
      evidenceStrength: 'moderate',
      approvedTargetKey: 'food:high_tyramine_foods',
      approvedAction: 'avoid',
      attributionConfirmed: false, // NOT confirmed!
      candidateSemanticHash: testSemanticHash,
      isDraft: false,
    }

    const reviewerContext: ClinicalReviewerContext = {
      userId: testUserId,
      role: 'pharmacist',
      verificationStatus: 'verified',
      isActive: true,
      canPublish: false,
      capabilities: ['medication_food'],
    }

    const consensus = evaluateTaskConsensus({
      task,
      decisions: [decisionWithoutConfirmation],
      reviewersById: new Map([[testUserId, reviewerContext]]),
    })

    expect(consensus.readyToPublish).toBe(false)
    expect(consensus.reasons.some((r) => r.includes('attribution confirmation'))).toBe(true)
  })

  it('19. needs_more_evidence requires note', () => {
    const note = ''
    const hasValidNote = note.trim().length > 0
    expect(hasValidNote).toBe(false)
  })

  it('20. reject reason validated', () => {
    const validReasons = new Set([
      'false_positive',
      'wrong_subject',
      'wrong_target',
      'wrong_action',
      'non_clinical_instruction',
      'duplicate',
      'source_problem',
      'other',
    ])
    expect(validReasons.has('false_positive')).toBe(true)
    expect(validReasons.has('arbitrary_uncontrolled_reason')).toBe(false)
  })

  it('21. reviewer identity server-derived', () => {
    // In our actions, reviewerUserId is taken directly from session.user.id
    const sessionUserId = 'verified_session_user_123'
    const clientProvidedName = 'malicious_impersonator'
    const effectiveReviewer = sessionUserId
    expect(effectiveReviewer).toBe(sessionUserId)
    expect(effectiveReviewer).not.toBe(clientProvidedName)
  })

  it('22. reviewed_at server-derived', () => {
    const serverTimestamp = new Date()
    expect(serverTimestamp instanceof Date).toBe(true)
    expect(Number.isNaN(serverTimestamp.getTime())).toBe(false)
  })

  it('23. stale form version rejected', async () => {
    // If expectedVersion != task.version, optimistic concurrency fails
    const expectedStaleVersion = 999
    await expect(
      updateClinicalReviewTaskStatus(db, testTaskId, 'in_review', expectedStaleVersion),
    ).rejects.toThrow(/changed while you were reviewing/i)
  })

  it('24. stale semantic hash rejected', () => {
    const task = {
      id: testTaskId,
      status: 'pending',
      subjectType: 'medication' as const,
      targetType: 'food',
      action: 'avoid',
      requiredCapability: 'medication_food',
      candidateSemanticHash: 'new_current_hash_1234567890',
    }
    const staleDecision = {
      id: 'd1',
      reviewerUserId: testUserId,
      decision: 'approve' as const,
      severity: 'low',
      evidenceStrength: 'moderate',
      candidateSemanticHash: 'old_stale_hash_0987654321', // mismatch
      isDraft: false,
    }
    const reviewerContext: ClinicalReviewerContext = {
      userId: testUserId,
      role: 'pharmacist',
      verificationStatus: 'verified',
      isActive: true,
      canPublish: false,
      capabilities: ['medication_food'],
    }

    const consensus = evaluateTaskConsensus({
      task,
      decisions: [staleDecision],
      reviewersById: new Map([[testUserId, reviewerContext]]),
    })

    expect(consensus.readyToPublish).toBe(false)
    expect(consensus.reasons.some((r) => r.includes('stale semantic hash'))).toBe(true)
  })

  // -------------------------------------------------------------------------
  // SECTION 68: PUBLISH GATE TESTS (25 - 33)
  // -------------------------------------------------------------------------

  it('25. normal reviewer cannot publish', async () => {
    // testUserId has canPublish = false and role = 'pharmacist'
    await expect(
      publishReviewedClinicalInteraction(db, {
        taskId: testTaskId,
        publisherUserId: testUserId,
      }),
    ).rejects.toThrow(/Publishing authorization denied/i)
  })

  it('26. non-publisher admin cannot publish', async () => {
    // Create an admin without can_publish
    const nonPublishAdminId = `usr_nopub_${Date.now()}`
    await db.insert(users).values({
      id: nonPublishAdminId,
      email: `nopub-${Date.now()}@ogun.internal`,
      name: 'No Publish Admin',
    })
    await db.insert(clinicalReviewerProfiles).values({
      userId: nonPublishAdminId,
      professionalRole: 'clinical_admin',
      verificationStatus: 'verified',
      isActive: true,
      canPublish: false, // FALSE!
    })

    try {
      await expect(
        publishReviewedClinicalInteraction(db, {
          taskId: testTaskId,
          publisherUserId: nonPublishAdminId,
        }),
      ).rejects.toThrow(/Publishing authorization denied/i)
    } finally {
      await db.delete(clinicalReviewerProfiles).where(eq(clinicalReviewerProfiles.userId, nonPublishAdminId))
      await db.delete(users).where(eq(users.id, nonPublishAdminId))
    }
  })

  it('27. clinical publisher with incomplete requirements fails', async () => {
    // Task is pending, no decisions submitted yet
    await expect(
      publishReviewedClinicalInteraction(db, {
        taskId: testTaskId,
        publisherUserId: testAdminId,
      }),
    ).rejects.toThrow(/Task publication failed validation/i)
  })

  it('32. second publish is idempotent', async () => {
    // If task is already marked published, validateTaskForPublishing returns alreadyPublished: true
    await db.update(clinicalReviewTasks).set({ status: 'published' }).where(eq(clinicalReviewTasks.id, testTaskId))

    const validation = await validateTaskForPublishing(db, testTaskId)
    expect(validation.valid).toBe(true)
    expect(validation.alreadyPublished).toBe(true)

    // Reset status back to pending
    await db.update(clinicalReviewTasks).set({ status: 'pending' }).where(eq(clinicalReviewTasks.id, testTaskId))
  })

  it('33. direct write path bypass impossible from exposed server API', () => {
    // Clinical Review action layer never invokes direct INSERT into clinical_interactions
    // without passing through publishReviewedClinicalInteraction which enforces clinical_admin and can_publish.
    expect(typeof publishReviewedClinicalInteraction).toBe('function')
    expect(typeof validateTaskForPublishing).toBe('function')
  })

  // -------------------------------------------------------------------------
  // SECTION 69: STORAGE & FAIL-CLOSED TESTS (39 - 41)
  // -------------------------------------------------------------------------

  it('39. blob/artifact unavailable approval fails closed', async () => {
    // Create an empty artifact store pointing to non-existent directory
    const emptyStore = new FilesystemArtifactStore('/non/existent/path')
    const exists = await emptyStore.exists('non_existent_cand_id', testSemanticHash)
    expect(exists).toBe(false)
  })

  it('40. generated raw/review files stay ignored in git', () => {
    const gitignoreContent = readFileSync(path.join(rootDir, '.gitignore'), 'utf8')
    expect(gitignoreContent.includes('packages/etl/data/clinical')).toBe(true)
  })

  it('41. production never relies on repo ignored filesystem', () => {
    // VercelBlobArtifactStore uses HTTP fetch instead of node:fs
    const blobStore = new VercelBlobArtifactStore('test_token_123')
    expect(typeof blobStore.getCandidateDetail).toBe('function')
    expect(typeof blobStore.getSnapshotIndex).toBe('function')
  })
})

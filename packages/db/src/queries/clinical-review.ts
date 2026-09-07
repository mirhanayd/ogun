import { and, asc, desc, eq, inArray, sql, type SQL } from 'drizzle-orm'
import type { Database } from '../client'
import {
  clinicalReviewAssignments,
  clinicalReviewAuditLog,
  clinicalReviewDecisions,
  clinicalReviewerCapabilities,
  clinicalReviewerProfiles,
  clinicalReviewTasks,
  conditions,
  medicationSubstances,
} from '../schema/clinical'
import { users } from '../schema/tenancy'

export type ClinicalProfessionalRole =
  | 'pharmacist'
  | 'dietitian'
  | 'physician'
  | 'clinical_admin'

export type ClinicalReviewerVerificationStatus =
  | 'pending'
  | 'verified'
  | 'suspended'
  | 'rejected'

export type ClinicalReviewerCapability =
  | 'medication_food'
  | 'medication_supplement'
  | 'medication_timing'
  | 'condition_nutrient'
  | 'condition_food'
  | 'oncology_medication'
  | 'renal_nutrition'
  | 'general_clinical'

export type ClinicalReviewTaskStatus =
  | 'pending'
  | 'assigned'
  | 'in_review'
  | 'needs_more_evidence'
  | 'approved'
  | 'rejected'
  | 'deferred'
  | 'ready_to_publish'
  | 'published'
  | 'source_changed'

export type ClinicalReviewPriority = 'P1' | 'P2' | 'P3' | 'P4' | 'P5'

export interface ListReviewTasksOptions {
  priority?: ClinicalReviewPriority
  status?: ClinicalReviewTaskStatus
  requiredCapability?: string
  medicationSubstanceId?: string
  targetType?: string
  action?: string
  candidateConfidence?: string
  ingredientAttribution?: string
  assignedReviewerId?: string
  searchQuery?: string
  limit?: number
  offset?: number
}

// ---------------------------------------------------------------------------
// Reviewer Profiles & Capabilities
// ---------------------------------------------------------------------------

export async function getClinicalReviewerProfile(db: Database, userId: string) {
  const [profile] = await db
    .select({
      userId: clinicalReviewerProfiles.userId,
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
    .where(eq(clinicalReviewerProfiles.userId, userId))
    .limit(1)

  return profile ?? null
}

export async function getClinicalReviewerWithCapabilities(db: Database, userId: string) {
  const profile = await getClinicalReviewerProfile(db, userId)
  if (!profile) return null

  const capabilities = await db
    .select({
      capability: clinicalReviewerCapabilities.capability,
      createdAt: clinicalReviewerCapabilities.createdAt,
    })
    .from(clinicalReviewerCapabilities)
    .where(eq(clinicalReviewerCapabilities.reviewerUserId, userId))

  return {
    ...profile,
    capabilities: capabilities.map((c) => c.capability as ClinicalReviewerCapability),
  }
}

export async function listClinicalReviewers(
  db: Database,
  options: {
    verificationStatus?: string
    professionalRole?: string
  } = {},
) {
  const filters: SQL[] = []
  if (options.verificationStatus) {
    filters.push(eq(clinicalReviewerProfiles.verificationStatus, options.verificationStatus))
  }
  if (options.professionalRole) {
    filters.push(eq(clinicalReviewerProfiles.professionalRole, options.professionalRole))
  }

  const reviewers = await db
    .select({
      userId: clinicalReviewerProfiles.userId,
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
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(asc(users.name))

  const userIds = reviewers.map((r) => r.userId)
  const capRows = userIds.length
    ? await db
        .select({
          reviewerUserId: clinicalReviewerCapabilities.reviewerUserId,
          capability: clinicalReviewerCapabilities.capability,
        })
        .from(clinicalReviewerCapabilities)
        .where(inArray(clinicalReviewerCapabilities.reviewerUserId, userIds))
    : []

  const capMap = new Map<string, ClinicalReviewerCapability[]>()
  for (const row of capRows) {
    const list = capMap.get(row.reviewerUserId) ?? []
    list.push(row.capability as ClinicalReviewerCapability)
    capMap.set(row.reviewerUserId, list)
  }

  // Count active assignments and completed decisions per reviewer
  const [assignmentCounts, decisionCounts] = await Promise.all([
    userIds.length
      ? db
          .select({
            reviewerUserId: clinicalReviewAssignments.reviewerUserId,
            activeAssignments: sql<number>`count(*) filter (where ${clinicalReviewAssignments.status} in ('assigned', 'in_progress'))::int`,
          })
          .from(clinicalReviewAssignments)
          .where(inArray(clinicalReviewAssignments.reviewerUserId, userIds))
          .groupBy(clinicalReviewAssignments.reviewerUserId)
      : [],
    userIds.length
      ? db
          .select({
            reviewerUserId: clinicalReviewDecisions.reviewerUserId,
            completedReviews: sql<number>`count(*) filter (where ${clinicalReviewDecisions.isDraft} = false)::int`,
          })
          .from(clinicalReviewDecisions)
          .where(inArray(clinicalReviewDecisions.reviewerUserId, userIds))
          .groupBy(clinicalReviewDecisions.reviewerUserId)
      : [],
  ])

  const assignMap = new Map(assignmentCounts.map((a) => [a.reviewerUserId, a.activeAssignments]))
  const decMap = new Map(decisionCounts.map((d) => [d.reviewerUserId, d.completedReviews]))

  return reviewers.map((r) => ({
    ...r,
    capabilities: capMap.get(r.userId) ?? [],
    activeAssignments: assignMap.get(r.userId) ?? 0,
    completedReviews: decMap.get(r.userId) ?? 0,
  }))
}

export async function upsertClinicalReviewerProfile(
  db: Database,
  profile: typeof clinicalReviewerProfiles.$inferInsert,
) {
  const [result] = await db
    .insert(clinicalReviewerProfiles)
    .values(profile)
    .onConflictDoUpdate({
      target: clinicalReviewerProfiles.userId,
      set: {
        professionalRole: profile.professionalRole,
        specialty: profile.specialty,
        verificationStatus: profile.verificationStatus,
        verifiedAt: profile.verifiedAt,
        verifiedBy: profile.verifiedBy,
        isActive: profile.isActive,
        canPublish: profile.canPublish,
        updatedAt: new Date(),
      },
    })
    .returning()
  return result
}

export async function setClinicalReviewerCapabilities(
  db: Database,
  reviewerUserId: string,
  capabilities: ClinicalReviewerCapability[],
) {
  return db.transaction(async (tx) => {
    await tx
      .delete(clinicalReviewerCapabilities)
      .where(eq(clinicalReviewerCapabilities.reviewerUserId, reviewerUserId))

    if (capabilities.length > 0) {
      await tx.insert(clinicalReviewerCapabilities).values(
        capabilities.map((cap) => ({
          reviewerUserId,
          capability: cap,
        })),
      )
    }
  })
}

// ---------------------------------------------------------------------------
// Review Tasks & Queue
// ---------------------------------------------------------------------------

export async function getClinicalReviewTaskById(db: Database, taskId: string) {
  const [task] = await db
    .select({
      id: clinicalReviewTasks.id,
      sourceSystem: clinicalReviewTasks.sourceSystem,
      candidateId: clinicalReviewTasks.candidateId,
      candidateSemanticHash: clinicalReviewTasks.candidateSemanticHash,
      subjectType: clinicalReviewTasks.subjectType,
      medicationSubstanceId: clinicalReviewTasks.medicationSubstanceId,
      medicationNameTr: medicationSubstances.nameTr,
      conditionId: clinicalReviewTasks.conditionId,
      conditionNameTr: conditions.nameTr,
      targetType: clinicalReviewTasks.targetType,
      targetKey: clinicalReviewTasks.targetKey,
      action: clinicalReviewTasks.action,
      candidateConfidence: clinicalReviewTasks.candidateConfidence,
      ingredientAttribution: clinicalReviewTasks.ingredientAttribution,
      reviewPriority: clinicalReviewTasks.reviewPriority,
      requiredCapability: clinicalReviewTasks.requiredCapability,
      status: clinicalReviewTasks.status,
      artifactLocator: clinicalReviewTasks.artifactLocator,
      evidenceCount: clinicalReviewTasks.evidenceCount,
      sourceDocumentCount: clinicalReviewTasks.sourceDocumentCount,
      version: clinicalReviewTasks.version,
      createdAt: clinicalReviewTasks.createdAt,
      updatedAt: clinicalReviewTasks.updatedAt,
    })
    .from(clinicalReviewTasks)
    .leftJoin(
      medicationSubstances,
      eq(medicationSubstances.id, clinicalReviewTasks.medicationSubstanceId),
    )
    .leftJoin(conditions, eq(conditions.id, clinicalReviewTasks.conditionId))
    .where(eq(clinicalReviewTasks.id, taskId))
    .limit(1)

  return task ?? null
}

export async function getClinicalReviewTaskByCandidateId(db: Database, candidateId: string) {
  const [task] = await db
    .select()
    .from(clinicalReviewTasks)
    .where(eq(clinicalReviewTasks.candidateId, candidateId))
    .limit(1)
  return task ?? null
}

export function buildListClinicalReviewTasksQuery(
  db: Database,
  options: ListReviewTasksOptions = {},
) {
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 100)
  const offset = Math.max(options.offset ?? 0, 0)
  const filters: SQL[] = []

  if (options.priority) {
    filters.push(eq(clinicalReviewTasks.reviewPriority, options.priority))
  }
  if (options.status) {
    filters.push(eq(clinicalReviewTasks.status, options.status))
  }
  if (options.requiredCapability) {
    filters.push(eq(clinicalReviewTasks.requiredCapability, options.requiredCapability))
  }
  if (options.medicationSubstanceId) {
    filters.push(eq(clinicalReviewTasks.medicationSubstanceId, options.medicationSubstanceId))
  }
  if (options.targetType) {
    filters.push(eq(clinicalReviewTasks.targetType, options.targetType))
  }
  if (options.action) {
    filters.push(eq(clinicalReviewTasks.action, options.action))
  }
  if (options.candidateConfidence) {
    filters.push(eq(clinicalReviewTasks.candidateConfidence, options.candidateConfidence))
  }
  if (options.ingredientAttribution) {
    filters.push(eq(clinicalReviewTasks.ingredientAttribution, options.ingredientAttribution))
  }
  if (options.assignedReviewerId) {
    filters.push(
      sql`exists (
        select 1 from ${clinicalReviewAssignments}
        where ${clinicalReviewAssignments.taskId} = ${clinicalReviewTasks.id}
          and ${clinicalReviewAssignments.reviewerUserId} = ${options.assignedReviewerId}
          and ${clinicalReviewAssignments.status} in ('assigned', 'in_progress')
      )`,
    )
  }

  if (options.searchQuery?.trim()) {
    const pattern = `%${options.searchQuery.trim().toLowerCase()}%`
    filters.push(
      sql`(
        ${clinicalReviewTasks.candidateId} ilike ${pattern}
        or ${clinicalReviewTasks.targetKey} ilike ${pattern}
        or exists (
          select 1 from ${medicationSubstances}
          where ${medicationSubstances.id} = ${clinicalReviewTasks.medicationSubstanceId}
            and ${medicationSubstances.searchText} ilike ${pattern}
        )
      )`,
    )
  }

  const whereClause = filters.length > 0 ? and(...filters) : undefined

  return {
    whereClause,
    limit,
    offset,
    countQuery: db
      .select({ count: sql<number>`count(*)::int` })
      .from(clinicalReviewTasks)
      .where(whereClause),
    itemsQuery: db
      .select({
        id: clinicalReviewTasks.id,
        sourceSystem: clinicalReviewTasks.sourceSystem,
        candidateId: clinicalReviewTasks.candidateId,
        candidateSemanticHash: clinicalReviewTasks.candidateSemanticHash,
        subjectType: clinicalReviewTasks.subjectType,
        medicationSubstanceId: clinicalReviewTasks.medicationSubstanceId,
        medicationNameTr: medicationSubstances.nameTr,
        conditionId: clinicalReviewTasks.conditionId,
        conditionNameTr: conditions.nameTr,
        targetType: clinicalReviewTasks.targetType,
        targetKey: clinicalReviewTasks.targetKey,
        action: clinicalReviewTasks.action,
        candidateConfidence: clinicalReviewTasks.candidateConfidence,
        ingredientAttribution: clinicalReviewTasks.ingredientAttribution,
        reviewPriority: clinicalReviewTasks.reviewPriority,
        requiredCapability: clinicalReviewTasks.requiredCapability,
        status: clinicalReviewTasks.status,
        artifactLocator: clinicalReviewTasks.artifactLocator,
        evidenceCount: clinicalReviewTasks.evidenceCount,
        sourceDocumentCount: clinicalReviewTasks.sourceDocumentCount,
        version: clinicalReviewTasks.version,
        createdAt: clinicalReviewTasks.createdAt,
        updatedAt: clinicalReviewTasks.updatedAt,
      })
      .from(clinicalReviewTasks)
      .leftJoin(
        medicationSubstances,
        eq(medicationSubstances.id, clinicalReviewTasks.medicationSubstanceId),
      )
      .leftJoin(conditions, eq(conditions.id, clinicalReviewTasks.conditionId))
      .where(whereClause)
      .orderBy(
        asc(clinicalReviewTasks.reviewPriority),
        desc(clinicalReviewTasks.evidenceCount),
        asc(clinicalReviewTasks.candidateId),
      )
      .limit(limit)
      .offset(offset),
  }
}

export async function listClinicalReviewTasks(
  db: Database,
  options: ListReviewTasksOptions = {},
) {
  const { countQuery, itemsQuery, limit, offset } = buildListClinicalReviewTasksQuery(db, options)
  const [countResult, tasks] = await Promise.all([countQuery, itemsQuery])

  return {
    total: countResult[0]?.count ?? 0,
    tasks,
    limit,
    offset,
  }
}

export async function getClinicalReviewDashboardKpis(
  db: Database,
  currentUserId?: string,
) {
  const [stats] = await db
    .select({
      totalTasks: sql<number>`count(*)::int`,
      pending: sql<number>`count(*) filter (where ${clinicalReviewTasks.status} = 'pending')::int`,
      assigned: sql<number>`count(*) filter (where ${clinicalReviewTasks.status} = 'assigned')::int`,
      inReview: sql<number>`count(*) filter (where ${clinicalReviewTasks.status} = 'in_review')::int`,
      needsMoreEvidence: sql<number>`count(*) filter (where ${clinicalReviewTasks.status} = 'needs_more_evidence')::int`,
      approved: sql<number>`count(*) filter (where ${clinicalReviewTasks.status} = 'approved')::int`,
      rejected: sql<number>`count(*) filter (where ${clinicalReviewTasks.status} = 'rejected')::int`,
      deferred: sql<number>`count(*) filter (where ${clinicalReviewTasks.status} = 'deferred')::int`,
      readyToPublish: sql<number>`count(*) filter (where ${clinicalReviewTasks.status} = 'ready_to_publish')::int`,
      published: sql<number>`count(*) filter (where ${clinicalReviewTasks.status} = 'published')::int`,
      sourceChanged: sql<number>`count(*) filter (where ${clinicalReviewTasks.status} = 'source_changed')::int`,
      p1: sql<number>`count(*) filter (where ${clinicalReviewTasks.reviewPriority} = 'P1')::int`,
      p2: sql<number>`count(*) filter (where ${clinicalReviewTasks.reviewPriority} = 'P2')::int`,
      p3: sql<number>`count(*) filter (where ${clinicalReviewTasks.reviewPriority} = 'P3')::int`,
      p4: sql<number>`count(*) filter (where ${clinicalReviewTasks.reviewPriority} = 'P4')::int`,
      p5: sql<number>`count(*) filter (where ${clinicalReviewTasks.reviewPriority} = 'P5')::int`,
      unassigned: sql<number>`count(*) filter (where ${clinicalReviewTasks.status} in ('pending', 'source_changed') and not exists (select 1 from ${clinicalReviewAssignments} where ${clinicalReviewAssignments.taskId} = ${clinicalReviewTasks.id} and ${clinicalReviewAssignments.status} in ('assigned', 'in_progress')))::int`,
    })
    .from(clinicalReviewTasks)

  let assignedToMe = 0
  if (currentUserId) {
    const [assignedResult] = await db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(clinicalReviewAssignments)
      .where(
        and(
          eq(clinicalReviewAssignments.reviewerUserId, currentUserId),
          inArray(clinicalReviewAssignments.status, ['assigned', 'in_progress']),
        ),
      )
    assignedToMe = assignedResult?.count ?? 0
  }

  const [activeReviewers] = await db
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(clinicalReviewerProfiles)
    .where(
      and(
        eq(clinicalReviewerProfiles.verificationStatus, 'verified'),
        eq(clinicalReviewerProfiles.isActive, true),
      ),
    )

  return {
    ...stats,
    assignedToMe,
    activeReviewersCount: activeReviewers?.count ?? 0,
  }
}

export async function upsertClinicalReviewTask(
  db: Database,
  task: typeof clinicalReviewTasks.$inferInsert,
) {
  const [result] = await db
    .insert(clinicalReviewTasks)
    .values(task)
    .onConflictDoUpdate({
      target: clinicalReviewTasks.candidateId,
      set: {
        candidateSemanticHash: task.candidateSemanticHash,
        targetType: task.targetType,
        targetKey: task.targetKey,
        action: task.action,
        candidateConfidence: task.candidateConfidence,
        ingredientAttribution: task.ingredientAttribution,
        reviewPriority: task.reviewPriority,
        requiredCapability: task.requiredCapability,
        artifactLocator: task.artifactLocator,
        evidenceCount: task.evidenceCount,
        sourceDocumentCount: task.sourceDocumentCount,
        updatedAt: new Date(),
      },
      setWhere: sql`(${clinicalReviewTasks.candidateSemanticHash}, ${clinicalReviewTasks.targetKey}, ${clinicalReviewTasks.action}, ${clinicalReviewTasks.evidenceCount}) is distinct from (${task.candidateSemanticHash}, ${task.targetKey}, ${task.action}, ${task.evidenceCount})`,
    })
    .returning()
  return result ?? null
}

export async function updateClinicalReviewTaskStatus(
  db: Database,
  taskId: string,
  newStatus: ClinicalReviewTaskStatus,
  expectedVersion: number,
) {
  const [updated] = await db
    .update(clinicalReviewTasks)
    .set({
      status: newStatus,
      version: expectedVersion + 1,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(clinicalReviewTasks.id, taskId),
        eq(clinicalReviewTasks.version, expectedVersion),
      ),
    )
    .returning()

  if (!updated) {
    throw new Error('This candidate changed while you were reviewing. Please refresh and retry.')
  }
  return updated
}

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------

export async function assignClinicalReviewTask(
  db: Database,
  taskId: string,
  reviewerUserId: string,
  assignmentRole: 'primary' | 'secondary' | 'co_review',
  assignedBy?: string,
) {
  const id = `cra_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`
  const [assignment] = await db
    .insert(clinicalReviewAssignments)
    .values({
      id,
      taskId,
      reviewerUserId,
      assignmentRole,
      status: 'assigned',
      assignedBy: assignedBy ?? null,
    })
    .onConflictDoUpdate({
      target: [clinicalReviewAssignments.taskId, clinicalReviewAssignments.reviewerUserId],
      set: {
        assignmentRole,
        status: 'assigned',
        assignedAt: new Date(),
        assignedBy: assignedBy ?? null,
      },
    })
    .returning()

  return assignment
}

export async function getTaskAssignments(db: Database, taskId: string) {
  return db
    .select({
      id: clinicalReviewAssignments.id,
      taskId: clinicalReviewAssignments.taskId,
      reviewerUserId: clinicalReviewAssignments.reviewerUserId,
      reviewerName: users.name,
      reviewerRole: clinicalReviewerProfiles.professionalRole,
      assignmentRole: clinicalReviewAssignments.assignmentRole,
      status: clinicalReviewAssignments.status,
      assignedAt: clinicalReviewAssignments.assignedAt,
      startedAt: clinicalReviewAssignments.startedAt,
      completedAt: clinicalReviewAssignments.completedAt,
    })
    .from(clinicalReviewAssignments)
    .innerJoin(users, eq(users.id, clinicalReviewAssignments.reviewerUserId))
    .leftJoin(
      clinicalReviewerProfiles,
      eq(clinicalReviewerProfiles.userId, clinicalReviewAssignments.reviewerUserId),
    )
    .where(eq(clinicalReviewAssignments.taskId, taskId))
    .orderBy(asc(clinicalReviewAssignments.assignedAt))
}

// ---------------------------------------------------------------------------
// Decisions & Drafts
// ---------------------------------------------------------------------------

export async function saveClinicalReviewDecision(
  db: Database,
  decision: typeof clinicalReviewDecisions.$inferInsert,
) {
  const [result] = await db
    .insert(clinicalReviewDecisions)
    .values(decision)
    .onConflictDoUpdate({
      target: [
        clinicalReviewDecisions.taskId,
        clinicalReviewDecisions.reviewerUserId,
        clinicalReviewDecisions.isDraft,
      ],
      set: {
        decision: decision.decision,
        severity: decision.severity,
        evidenceStrength: decision.evidenceStrength,
        approvedTargetKey: decision.approvedTargetKey,
        approvedAction: decision.approvedAction,
        titleTr: decision.titleTr,
        clinicalEffectTr: decision.clinicalEffectTr,
        mechanismTr: decision.mechanismTr,
        recommendationTr: decision.recommendationTr,
        attributionConfirmed: decision.attributionConfirmed,
        rejectReason: decision.rejectReason,
        reviewNote: decision.reviewNote,
        candidateSemanticHash: decision.candidateSemanticHash,
        updatedAt: new Date(),
      },
    })
    .returning()

  return result
}

export async function getClinicalReviewDecisions(
  db: Database,
  taskId: string,
  includeDraft = false,
) {
  const filters: SQL[] = [eq(clinicalReviewDecisions.taskId, taskId)]
  if (!includeDraft) {
    filters.push(eq(clinicalReviewDecisions.isDraft, false))
  }

  return db
    .select({
      id: clinicalReviewDecisions.id,
      taskId: clinicalReviewDecisions.taskId,
      reviewerUserId: clinicalReviewDecisions.reviewerUserId,
      reviewerName: users.name,
      reviewerRole: clinicalReviewerProfiles.professionalRole,
      decision: clinicalReviewDecisions.decision,
      severity: clinicalReviewDecisions.severity,
      evidenceStrength: clinicalReviewDecisions.evidenceStrength,
      approvedTargetKey: clinicalReviewDecisions.approvedTargetKey,
      approvedAction: clinicalReviewDecisions.approvedAction,
      titleTr: clinicalReviewDecisions.titleTr,
      clinicalEffectTr: clinicalReviewDecisions.clinicalEffectTr,
      mechanismTr: clinicalReviewDecisions.mechanismTr,
      recommendationTr: clinicalReviewDecisions.recommendationTr,
      attributionConfirmed: clinicalReviewDecisions.attributionConfirmed,
      rejectReason: clinicalReviewDecisions.rejectReason,
      reviewNote: clinicalReviewDecisions.reviewNote,
      candidateSemanticHash: clinicalReviewDecisions.candidateSemanticHash,
      isDraft: clinicalReviewDecisions.isDraft,
      createdAt: clinicalReviewDecisions.createdAt,
      updatedAt: clinicalReviewDecisions.updatedAt,
    })
    .from(clinicalReviewDecisions)
    .innerJoin(users, eq(users.id, clinicalReviewDecisions.reviewerUserId))
    .leftJoin(
      clinicalReviewerProfiles,
      eq(clinicalReviewerProfiles.userId, clinicalReviewDecisions.reviewerUserId),
    )
    .where(and(...filters))
    .orderBy(desc(clinicalReviewDecisions.createdAt))
}

export async function getUserDecisionForTask(
  db: Database,
  taskId: string,
  userId: string,
  isDraft: boolean,
) {
  const [decision] = await db
    .select()
    .from(clinicalReviewDecisions)
    .where(
      and(
        eq(clinicalReviewDecisions.taskId, taskId),
        eq(clinicalReviewDecisions.reviewerUserId, userId),
        eq(clinicalReviewDecisions.isDraft, isDraft),
      ),
    )
    .limit(1)

  return decision ?? null
}

// ---------------------------------------------------------------------------
// Audit Log (Append-Only)
// ---------------------------------------------------------------------------

export async function insertClinicalReviewAuditLog(
  db: Database,
  entry: {
    taskId?: string | null
    actorUserId: string
    eventType: (typeof clinicalReviewAuditLog.$inferInsert)['eventType']
    fromStatus?: string | null
    toStatus?: string | null
    compactChangeSummary: string
  },
) {
  const id = `cral_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`
  const [result] = await db
    .insert(clinicalReviewAuditLog)
    .values({
      id,
      taskId: entry.taskId ?? null,
      actorUserId: entry.actorUserId,
      eventType: entry.eventType,
      fromStatus: entry.fromStatus ?? null,
      toStatus: entry.toStatus ?? null,
      compactChangeSummary: entry.compactChangeSummary,
    })
    .returning()

  return result
}

export async function getClinicalReviewAuditLogs(
  db: Database,
  options: {
    taskId?: string
    actorUserId?: string
    limit?: number
    offset?: number
  } = {},
) {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200)
  const offset = Math.max(options.offset ?? 0, 0)
  const filters: SQL[] = []

  if (options.taskId) {
    filters.push(eq(clinicalReviewAuditLog.taskId, options.taskId))
  }
  if (options.actorUserId) {
    filters.push(eq(clinicalReviewAuditLog.actorUserId, options.actorUserId))
  }

  const whereClause = filters.length ? and(...filters) : undefined

  return db
    .select({
      id: clinicalReviewAuditLog.id,
      taskId: clinicalReviewAuditLog.taskId,
      actorUserId: clinicalReviewAuditLog.actorUserId,
      actorName: users.name,
      eventType: clinicalReviewAuditLog.eventType,
      fromStatus: clinicalReviewAuditLog.fromStatus,
      toStatus: clinicalReviewAuditLog.toStatus,
      compactChangeSummary: clinicalReviewAuditLog.compactChangeSummary,
      createdAt: clinicalReviewAuditLog.createdAt,
    })
    .from(clinicalReviewAuditLog)
    .innerJoin(users, eq(users.id, clinicalReviewAuditLog.actorUserId))
    .where(whereClause)
    .orderBy(desc(clinicalReviewAuditLog.createdAt))
    .limit(limit)
    .offset(offset)
}

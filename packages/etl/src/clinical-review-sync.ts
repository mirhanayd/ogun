import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { db as defaultDb, type Database } from '@ogun/db'
import {
  clinicalReviewAuditLog,
  clinicalReviewTasks,
  medicationSubstances,
  users,
} from '@ogun/db/schema'
import { eq, inArray, sql } from 'drizzle-orm'
import {
  FilesystemArtifactStore,
  type ClinicalReviewArtifactStore,
} from './clinical-review-artifact-store'
import type { CompactSnapshotIndex } from './clinical-review-web-bundle'

export const SYSTEM_USER_ID = 'usr_system_sync'

export async function ensureSystemUser(database: Database): Promise<string> {
  await database
    .insert(users)
    .values({
      id: SYSTEM_USER_ID,
      email: 'system@ogun.internal',
      name: 'Ogun Clinical System',
      emailVerified: true,
    })
    .onConflictDoNothing()
  return SYSTEM_USER_ID
}

export interface SyncOpenFdaTasksOptions {
  baseDir: string
  bundlesDir?: string
  artifactStore?: ClinicalReviewArtifactStore
  dryRun?: boolean
  database?: Database
}

export interface SyncOpenFdaTasksResult {
  semanticHash: string
  totalCandidates: number
  inserted: number
  updated: number
  unchanged: number
  sourceChanged: number
  dryRun: boolean
  countsByPriority: Record<string, number>
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

export async function syncOpenFdaReviewTasks(
  options: SyncOpenFdaTasksOptions,
): Promise<SyncOpenFdaTasksResult> {
  const dryRun = options.dryRun ?? false
  const database = options.database ?? defaultDb
  const bundlesDir = options.bundlesDir ?? path.join(options.baseDir, 'bundles')

  const store = options.artifactStore ?? new FilesystemArtifactStore(bundlesDir)

  // Expected semantic hash for current openFDA snapshot
  const expectedSemanticHash = '4b971d4a85f3eb2a75066266e9f4154bbe0f91c0802167fc7fded28e76aabbdd'
  const index = await store.getSnapshotIndex(expectedSemanticHash)

  if (!index) {
    throw new Error(
      `Snapshot index not found in artifact store for hash: ${expectedSemanticHash}.\nEnsure bundles are generated first.`,
    )
  }

  if (index.candidateSemanticHash !== expectedSemanticHash) {
    throw new Error(
      `Snapshot index hash mismatch: expected ${expectedSemanticHash}, got ${index.candidateSemanticHash}`,
    )
  }

  // Verify all medication substance IDs exist in Ogun DB
  const substanceIds = [...new Set(index.candidates.map((c) => c.medicationSubstanceId))]
  const existingSubstances = await database
    .select({ id: medicationSubstances.id })
    .from(medicationSubstances)
    .where(inArray(medicationSubstances.id, substanceIds))
  const existingSubstanceSet = new Set(existingSubstances.map((s) => s.id))

  const missingSubstances = substanceIds.filter((id) => !existingSubstanceSet.has(id))
  if (missingSubstances.length > 0) {
    throw new Error(
      `Candidate references ${missingSubstances.length} medication substances missing from Ogun DB: ${missingSubstances.slice(0, 3).join(', ')}...`,
    )
  }

  // Query all existing tasks in DB
  const candidateIds = index.candidates.map((c) => c.candidateId)
  const existingTasks = await database
    .select()
    .from(clinicalReviewTasks)
    .where(inArray(clinicalReviewTasks.candidateId, candidateIds))

  const existingByCandidateId = new Map(existingTasks.map((t) => [t.candidateId, t]))

  const countsByPriority: Record<string, number> = { P1: 0, P2: 0, P3: 0, P4: 0, P5: 0 }
  const tasksToInsert: Array<typeof clinicalReviewTasks.$inferInsert> = []
  const auditLogsToInsert: Array<typeof clinicalReviewAuditLog.$inferInsert> = []
  const tasksToMarkStale: Array<{
    existing: (typeof existingTasks)[0]
    locator: string
    evidenceCount: number
    splCount: number
  }> = []
  const tasksToUpdateMetadata: Array<{
    id: string
    targetKey: string
    action: string
    priority: string
    confidence: string
    cap: string
    evidenceCount: number
    splCount: number
  }> = []
  let unchanged = 0

  for (const candidate of index.candidates) {
    countsByPriority[candidate.reviewPriority] =
      (countsByPriority[candidate.reviewPriority] ?? 0) + 1

    const existing = existingByCandidateId.get(candidate.candidateId)
    const taskId = existing ? existing.id : `crt_${candidate.candidateId.replace('ofci_', '')}`
    const artifactLocator = `clinical-review/snapshots/${expectedSemanticHash}/candidates/${candidate.candidateId}.json.gz`

    if (!existing) {
      tasksToInsert.push({
        id: taskId,
        sourceSystem: 'openfda',
        candidateId: candidate.candidateId,
        candidateSemanticHash: expectedSemanticHash,
        subjectType: 'medication',
        medicationSubstanceId: candidate.medicationSubstanceId,
        conditionId: null,
        targetType: candidate.targetType,
        targetKey: candidate.resolvedTargetKey,
        action: candidate.action,
        candidateConfidence: candidate.candidateConfidence,
        ingredientAttribution: candidate.ingredientAttribution,
        reviewPriority: candidate.reviewPriority,
        requiredCapability: candidate.requiredCapability,
        status: 'pending',
        artifactLocator,
        evidenceCount: candidate.evidenceCount,
        sourceDocumentCount: candidate.splCount,
        version: 1,
      })

      auditLogsToInsert.push({
        id: `cral_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`,
        taskId,
        actorUserId: SYSTEM_USER_ID,
        eventType: 'task_created',
        fromStatus: null,
        toStatus: 'pending',
        compactChangeSummary: `Candidate task synced from openFDA snapshot (priority: ${candidate.reviewPriority})`,
      })
    } else {
      // Existing task: Check semantic hash staleness
      if (existing.candidateSemanticHash !== expectedSemanticHash) {
        tasksToMarkStale.push({
          existing,
          locator: artifactLocator,
          evidenceCount: candidate.evidenceCount,
          splCount: candidate.splCount,
        })
      } else {
        // Check if metadata changed
        const isMetadataSame =
          existing.targetKey === candidate.resolvedTargetKey &&
          existing.action === candidate.action &&
          existing.reviewPriority === candidate.reviewPriority &&
          existing.candidateConfidence === candidate.candidateConfidence &&
          existing.evidenceCount === candidate.evidenceCount &&
          existing.sourceDocumentCount === candidate.splCount

        if (isMetadataSame) {
          unchanged += 1
        } else {
          tasksToUpdateMetadata.push({
            id: existing.id,
            targetKey: candidate.resolvedTargetKey,
            action: candidate.action,
            priority: candidate.reviewPriority,
            confidence: candidate.candidateConfidence,
            cap: candidate.requiredCapability,
            evidenceCount: candidate.evidenceCount,
            splCount: candidate.splCount,
          })
        }
      }
    }
  }

  if (!dryRun) {
    await ensureSystemUser(database)

    // Execute inserts in batches of 50
    if (tasksToInsert.length > 0) {
      for (const batch of chunkArray(tasksToInsert, 50)) {
        await database
          .insert(clinicalReviewTasks)
          .values(batch)
          .onConflictDoUpdate({
            target: clinicalReviewTasks.candidateId,
            set: {
              candidateSemanticHash: sql`excluded.candidate_semantic_hash`,
              targetKey: sql`excluded.target_key`,
              action: sql`excluded.action`,
              reviewPriority: sql`excluded.review_priority`,
              requiredCapability: sql`excluded.required_capability`,
              candidateConfidence: sql`excluded.candidate_confidence`,
              ingredientAttribution: sql`excluded.ingredient_attribution`,
              artifactLocator: sql`excluded.artifact_locator`,
              evidenceCount: sql`excluded.evidence_count`,
              sourceDocumentCount: sql`excluded.source_document_count`,
              updatedAt: new Date(),
            },
          })
      }

      for (const batch of chunkArray(auditLogsToInsert, 50)) {
        await database.insert(clinicalReviewAuditLog).values(batch)
      }
    }

    // Execute stale status updates
    for (const item of tasksToMarkStale) {
      await database
        .update(clinicalReviewTasks)
        .set({
          candidateSemanticHash: expectedSemanticHash,
          status: 'source_changed',
          version: item.existing.version + 1,
          artifactLocator: item.locator,
          evidenceCount: item.evidenceCount,
          sourceDocumentCount: item.splCount,
          updatedAt: new Date(),
        })
        .where(eq(clinicalReviewTasks.id, item.existing.id))

      await database.insert(clinicalReviewAuditLog).values({
        id: `cral_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`,
        taskId: item.existing.id,
        actorUserId: SYSTEM_USER_ID,
        eventType: 'source_changed',
        fromStatus: item.existing.status,
        toStatus: 'source_changed',
        compactChangeSummary: `Source candidate semantic hash changed (${item.existing.candidateSemanticHash} -> ${expectedSemanticHash}). Invalidating previous review status.`,
      })
    }

    // Execute metadata updates
    for (const item of tasksToUpdateMetadata) {
      await database
        .update(clinicalReviewTasks)
        .set({
          targetKey: item.targetKey,
          action: item.action,
          reviewPriority: item.priority,
          candidateConfidence: item.confidence,
          requiredCapability: item.cap,
          evidenceCount: item.evidenceCount,
          sourceDocumentCount: item.splCount,
          updatedAt: new Date(),
        })
        .where(eq(clinicalReviewTasks.id, item.id))
    }
  }

  return {
    semanticHash: expectedSemanticHash,
    totalCandidates: index.candidates.length,
    inserted: tasksToInsert.length,
    updated: tasksToUpdateMetadata.length,
    unchanged,
    sourceChanged: tasksToMarkStale.length,
    dryRun,
    countsByPriority,
  }
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run')
  if (!isDryRun) {
    const { assertDatabaseWriteTarget } = await import('@ogun/db/database-target')
    assertDatabaseWriteTarget({ operation: 'etl', databaseUrl: process.env.DATABASE_URL })
  }
  const baseArgument = process.argv.slice(2).find((item) => item.startsWith('--dir='))
  const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const baseDir = path.resolve(
    baseArgument?.slice('--dir='.length) ?? path.join(packageDir, 'data/clinical/openfda'),
  )

  console.log(`Starting openFDA review task sync (dryRun: ${isDryRun})...`)
  console.log(`Base directory: ${baseDir}`)

  const result = await syncOpenFdaReviewTasks({
    baseDir,
    dryRun: isDryRun,
  })

  console.log('\n--- Task Sync Results ---')
  console.log(`Semantic hash: ${result.semanticHash}`)
  console.log(`Total candidates: ${result.totalCandidates}`)
  console.log(`Inserted: ${result.inserted}`)
  console.log(`Updated: ${result.updated}`)
  console.log(`Unchanged: ${result.unchanged}`)
  console.log(`Source changed (stale): ${result.sourceChanged}`)
  console.log(`Dry run: ${result.dryRun}`)
  console.log('Priority distribution:', result.countsByPriority)

  process.exit(0)
}

if (process.argv[1] && import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}

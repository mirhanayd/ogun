import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { db } from '@ogun/db'
import {
  clinicalReviewAuditLog,
  clinicalReviewTasks,
} from '@ogun/db/schema'
import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import {
  FilesystemArtifactStore,
} from './clinical-review-artifact-store'
import {
  syncOpenFdaReviewTasks,
} from './clinical-review-sync'

describe('openFDA task sync and storage safety', () => {
  const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const baseDir = path.resolve(packageDir, 'data/clinical/openfda')

  it(
    '36 & 37. performs sync of 323 candidates and ensures second sync has 0 changes (idempotent)',
    async () => {
      // 1. Dry run
      const dryRun = await syncOpenFdaReviewTasks({
        baseDir,
        dryRun: true,
        database: db,
      })
      expect(dryRun.totalCandidates).toBe(323)
      expect(dryRun.countsByPriority).toEqual({ P1: 43, P2: 93, P3: 65, P4: 37, P5: 85 })

      // 2. Real Apply (First Sync)
      const run1 = await syncOpenFdaReviewTasks({
        baseDir,
        dryRun: false,
        database: db,
      })
      expect(run1.totalCandidates).toBe(323)
      expect(run1.inserted + run1.unchanged).toBe(323)

      // 3. Second Sync (Must be 100% idempotent with 0 inserted, 0 updated, 0 sourceChanged)
      const run2 = await syncOpenFdaReviewTasks({
        baseDir,
        dryRun: false,
        database: db,
      })
      expect(run2.inserted).toBe(0)
      expect(run2.updated).toBe(0)
      expect(run2.sourceChanged).toBe(0)
      expect(run2.unchanged).toBe(323)
    },
    30000,
  )

  it(
    '38. semantic hash change marks task as source_changed',
    async () => {
      // Pick one existing openfda task to test hash staleness
      const [sampleTask] = await db
        .select()
        .from(clinicalReviewTasks)
        .where(eq(clinicalReviewTasks.sourceSystem, 'openfda'))
        .limit(1)

      expect(sampleTask).toBeDefined()
      if (!sampleTask) return

      // Artificially change its semantic hash in DB to simulate older version
      const oldHash = 'old_stale_hash_123456789'
      await db
        .update(clinicalReviewTasks)
        .set({ candidateSemanticHash: oldHash, status: 'approved' })
        .where(eq(clinicalReviewTasks.id, sampleTask.id))

      // Run sync again
      const syncResult = await syncOpenFdaReviewTasks({
        baseDir,
        dryRun: false,
        database: db,
      })

      expect(syncResult.sourceChanged).toBeGreaterThanOrEqual(1)

      // Verify task status was transitioned to source_changed
      const [refreshed] = await db
        .select()
        .from(clinicalReviewTasks)
        .where(eq(clinicalReviewTasks.id, sampleTask.id))

      expect(refreshed?.status).toBe('source_changed')
      expect(refreshed?.candidateSemanticHash).toBe(
        '4b971d4a85f3eb2a75066266e9f4154bbe0f91c0802167fc7fded28e76aabbdd',
      )

      // Verify audit log recorded source_changed event
      const auditLogs = await db
        .select()
        .from(clinicalReviewAuditLog)
        .where(eq(clinicalReviewAuditLog.taskId, sampleTask.id))

      const hasSourceChangedLog = auditLogs.some((l) => l.eventType === 'source_changed')
      expect(hasSourceChangedLog).toBe(true)

      // Restore to pending for clean state
      await db
        .update(clinicalReviewTasks)
        .set({ status: 'pending' })
        .where(eq(clinicalReviewTasks.id, sampleTask.id))
    },
    30000,
  )

  it('39. missing artifact store or corrupt snapshot fails closed', async () => {
    const invalidStore = new FilesystemArtifactStore(
      path.join(baseDir, 'non_existent_bundles_dir'),
    )

    await expect(
      syncOpenFdaReviewTasks({
        baseDir,
        artifactStore: invalidStore,
        database: db,
      }),
    ).rejects.toThrow(/Snapshot index not found/)
  })
})

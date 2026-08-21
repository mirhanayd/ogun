import 'server-only'
import { db } from '@ogun/db'
import {
  getActiveGoal,
  getLatestMeasurement,
  listGoalsForClient,
  listMeasurementsForClient,
} from '@ogun/db/queries'
import type { GoalType } from '@ogun/db/schema'
import { withClientAuth } from '@/lib/authz'
import { withAudit } from '@/lib/audit'

// Ölçüm/hedef okumaları (GitHub issue #18 / Prompt 4.2) — danisanlar/queries.ts
// (GitHub issue #17 / Prompt 4.1) ile AYNI desen: server action DEĞİL (mutasyon
// yok), sadece withAuth(withAudit(...)) ile sarılmış normal sunucu
// fonksiyonları. Sağlık verisi olduğu için (BİA çıktıları, vücut ölçüleri)
// okuma da denetleniyor (bkz. lib/audit.ts dosya başı notu).

export const listClientMeasurements = withClientAuth(
  withAudit(
    {
      action: 'read',
      entityType: 'measurement',
      metadata: ([clientId, options]: [string, { since?: Date } | undefined]) => ({
        clientId,
        since: options?.since?.toISOString(),
      }),
    },
    async (ctx, clientId: string, options?: { since?: Date }) =>
      listMeasurementsForClient(db, ctx.scope.clinicId, clientId, options ?? {}),
  ),
)

export const getClientLatestMeasurement = withClientAuth(
  withAudit(
    { action: 'read', entityType: 'measurement', entityId: ([clientId]: [string]) => clientId },
    async (ctx, clientId: string) => getLatestMeasurement(db, ctx.scope.clinicId, clientId),
  ),
)

export const getClientActiveGoal = withClientAuth(
  withAudit(
    {
      action: 'read',
      entityType: 'client_goal',
      entityId: ([clientId]: [string, GoalType]) => clientId,
    },
    async (ctx, clientId: string, type: GoalType) =>
      getActiveGoal(db, ctx.scope.clinicId, clientId, type),
  ),
)

export const listClientGoals = withClientAuth(
  withAudit(
    { action: 'read', entityType: 'client_goal', entityId: ([clientId]: [string]) => clientId },
    async (ctx, clientId: string) => listGoalsForClient(db, ctx.scope.clinicId, clientId),
  ),
)

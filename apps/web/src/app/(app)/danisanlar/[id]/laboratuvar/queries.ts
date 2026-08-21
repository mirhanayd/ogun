import 'server-only'
import { db } from '@ogun/db'
import { listAbnormalLatestLabResults, listLabResultsForClient } from '@ogun/db/queries'
import { withClientAuth } from '@/lib/authz'
import { withAudit } from '@/lib/audit'

// Laboratuvar sonucu okumaları (GitHub issue #19 / Prompt 4.3, GÖREV 2) —
// measurements/queries.ts ile AYNI desen.

export const listClientLabResults = withClientAuth(
  withAudit(
    { action: 'read', entityType: 'lab_result', entityId: ([clientId]: [string]) => clientId },
    async (ctx, clientId: string) => listLabResultsForClient(db, ctx.scope.clinicId, clientId),
  ),
)

// Danışan özet kartındaki "anormal değer" rozeti (GÖREV 2) — [id]/page.tsx
// SummaryStat alanlarının yanına eklenir.
export const listClientAbnormalLabResults = withClientAuth(
  withAudit(
    { action: 'read', entityType: 'lab_result', entityId: ([clientId]: [string]) => clientId },
    async (ctx, clientId: string) => listAbnormalLatestLabResults(db, ctx.scope.clinicId, clientId),
  ),
)

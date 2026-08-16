import { db } from '@ogun/db'
import { listPlans } from '@ogun/db/queries'
import { withAuth } from '@/lib/authz'
import { withAudit } from '@/lib/audit'

// GitHub issue #25 / Prompt 5.3 — "Planlar" sekmesi (danisanlar/[id]/page.tsx)
// için, measurements/queries.ts ve laboratuvar/queries.ts'teki AYNI desen:
// sekmenin kendi server component'i (planlar-tab.tsx) kendi verisini kendisi
// çeker.
export const listClientPlans = withAuth(
  withAudit({ action: 'read', entityType: 'diet_plan' }, async (ctx, clientId: string) =>
    listPlans(db, ctx.scope.clinicId, { clientId }),
  ),
)

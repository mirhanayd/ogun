import { db } from '@ogun/db'
import { getShareStatusesForPlans, listPlans } from '@ogun/db/queries'
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

// GitHub issue #36 / Prompt 6.2, GÖREV 4 — planlar-tab.tsx'in "gönderildi/
// görüntülendi" göstergesi için, listClientPlans ile AYNI withAuth+withAudit
// deseni (audit action 'read' — plan_share erişim durumu da danışan verisiyle
// ilişkili bir okuma, bkz. audit.ts dosya başı notu "read de burada bir iz
// bırakmalı").
export const getClientPlanShareStatuses = withAuth(
  withAudit({ action: 'read', entityType: 'plan_share' }, async (ctx, planIds: string[]) =>
    getShareStatusesForPlans(db, ctx.scope.clinicId, planIds),
  ),
)

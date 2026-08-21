import 'server-only'
import { db } from '@ogun/db'
import { getClientHealth } from '@ogun/db/queries'
import { withClientAuth } from '@/lib/authz'
import { withAudit } from '@/lib/audit'

// Anamnez okuması (GitHub issue #19 / Prompt 4.3, GÖREV 1) — measurements/
// queries.ts ile AYNI desen: server action DEĞİL, withAuth(withAudit(...))
// ile sarılmış normal bir sunucu fonksiyonu. Sağlık verisi olduğu için okuma
// da denetlenir (bkz. lib/audit.ts dosya başı notu).
export const getClientHealthRecord = withClientAuth(
  withAudit(
    { action: 'read', entityType: 'client_health', entityId: ([clientId]: [string]) => clientId },
    async (ctx, clientId: string) => getClientHealth(db, ctx.scope.clinicId, clientId),
  ),
)

import 'server-only'
import { db } from '@ogun/db'
import { listBillingPackages, listClientPackagesForClient, listPaymentsForClient } from '@ogun/db/queries'
import { withClientAuth } from '@/lib/authz'
import { withAudit } from '@/lib/audit'

// GitHub issue #40 / Prompt 7.2, GÖREV 2 — "danışan cari hesabı" okuması.
// measurements/queries.ts (GitHub issue #18) ile AYNI desen: server action
// DEĞİL, withAuth(withAudit(...)) ile sarılmış normal sunucu fonksiyonları.
export const getClientBillingData = withClientAuth(
  withAudit(
    { action: 'read', entityType: 'client_billing', entityId: ([clientId]: [string]) => clientId },
    async (ctx, clientId: string) => {
      const [clientPackages, payments, availablePackages] = await Promise.all([
        listClientPackagesForClient(db, ctx.scope.clinicId, clientId),
        listPaymentsForClient(db, ctx.scope.clinicId, clientId),
        listBillingPackages(db, ctx.scope.clinicId),
      ])
      return {
        clientPackages,
        payments,
        availablePackages: availablePackages.filter((row) => row.isActive),
      }
    },
  ),
)

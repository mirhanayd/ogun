import 'server-only'
import { db } from '@ogun/db'
import {
  listBillingPackages,
  listClientPackagesForClinic,
  listExpensesForClinicInRange,
  listPaymentsForClientPackages,
  listPaymentsForClinicInRange,
} from '@ogun/db/queries'
import { withAuth } from '@/lib/authz'
import { withAudit } from '@/lib/audit'

// GitHub issue #40 / Prompt 7.2, GÖREV 3 — /finans okumaları. randevular/queries.ts
// (GitHub issue #39) ile AYNI desen: server action DEĞİL, withAuth(withAudit(...))
// ile sarılmış normal sunucu fonksiyonları. FARK: buradaki withAuth çağrıları
// roller parametresiyle ['owner'] veriyor — nav-items.ts requiredRole SADECE
// menüde GİZLER, doğrudan URL'e gidilirse asıl engelleme BURADA (requireRole
// üzerinden) gerçekleşir (bkz. lib/authz.ts requireRole/InsufficientRoleError).

export const getFinanceOverview = withAuth(
  withAudit(
    {
      action: 'read',
      entityType: 'finance_overview',
      metadata: ([range]: [{ from: Date; to: Date }]) => ({ from: range.from.toISOString(), to: range.to.toISOString() }),
    },
    async (ctx, range: { from: Date; to: Date }) => {
      const fromDate = range.from.toISOString().slice(0, 10)
      const toDate = range.to.toISOString().slice(0, 10)

      const [payments, expenses, clientPackages] = await Promise.all([
        listPaymentsForClinicInRange(db, ctx.scope.clinicId, range),
        listExpensesForClinicInRange(db, ctx.scope.clinicId, { from: fromDate, to: toDate }),
        listClientPackagesForClinic(db, ctx.scope.clinicId),
      ])

      const clientPackagePayments = await listPaymentsForClientPackages(
        db,
        ctx.scope.clinicId,
        clientPackages.map((row) => row.id),
      )

      return { payments, expenses, clientPackages, clientPackagePayments }
    },
  ),
  ['owner'],
)

export const getBillingPackagesList = withAuth(
  withAudit(
    { action: 'read', entityType: 'billing_package' },
    async (ctx) => listBillingPackages(db, ctx.scope.clinicId),
  ),
  ['owner'],
)

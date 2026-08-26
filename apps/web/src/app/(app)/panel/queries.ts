import 'server-only'
import { db } from '@ogun/db'
import {
  listActiveClientsWithLastMeasurement,
  listAppointmentsInRange,
  listExpiringClientPackages,
  listRecentNoShowAppointments,
  type AppointmentListRow,
} from '@ogun/db/queries'
import { withAuth } from '@/lib/authz'
import { withAudit } from '@/lib/audit'
import {
  buildNotificationFeed,
  NO_SHOW_LOOKBACK_DAYS,
  PACKAGE_EXPIRY_WARNING_DAYS,
  selectUpcomingAppointments,
  UPCOMING_APPOINTMENT_DAYS,
  type NotificationFeed,
} from '@/lib/notifications/summary'

export interface PanelNotificationFeed extends NotificationFeed {
  canManageFinance: boolean
  upcomingAppointments: AppointmentListRow[]
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
}
function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
}

// Panel (dashboard) bildirim akışı — GitHub issue #41 / Prompt 7.3, GÖREV 4.
// finans/queries.ts (GitHub #40) ile AYNI desen: server action DEĞİL,
// withAuth(withAudit(...)) ile sarılmış normal sunucu fonksiyonu. Ham
// sorguları (packages/db/src/queries/notifications.ts) çağırıp SAF
// buildNotificationFeed (apps/web/src/lib/notifications/summary.ts) ile
// şekillendiriyor — aynı finance-aggregation.ts iş bölümü.
export const getPanelNotificationFeed = withAuth(
  withAudit(
    { action: 'read', entityType: 'notification_feed' },
    async (ctx): Promise<PanelNotificationFeed> => {
      const clinicId = ctx.scope.clinicId
      const now = new Date()
      const assignedDietitianId = ctx.role === 'dietitian' ? ctx.user.id : undefined
      const visibility = { assignedDietitianId }

      const [
        todayAppointments,
        upcomingAppointmentsRaw,
        noShowClients,
        clientsWithLastMeasurement,
        expiringPackages,
      ] = await Promise.all([
        listAppointmentsInRange(db, clinicId, {
          from: startOfDay(now),
          to: endOfDay(now),
          visibleToDietitianId: assignedDietitianId,
        }),
        listAppointmentsInRange(db, clinicId, {
          from: now,
          to: new Date(now.getTime() + UPCOMING_APPOINTMENT_DAYS * 24 * 60 * 60 * 1000),
          visibleToDietitianId: assignedDietitianId,
        }),
        listRecentNoShowAppointments(
          db,
          clinicId,
          new Date(now.getTime() - NO_SHOW_LOOKBACK_DAYS * 24 * 60 * 60 * 1000),
          visibility,
        ),
        listActiveClientsWithLastMeasurement(db, clinicId, visibility),
        listExpiringClientPackages(
          db,
          clinicId,
          new Date(now.getTime() + PACKAGE_EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000),
          visibility,
        ),
      ])

      return {
        ...buildNotificationFeed(
          {
            todayAppointmentsCount: todayAppointments.length,
            noShowClients,
            clientsWithLastMeasurement,
            expiringPackages,
          },
          now,
        ),
        canManageFinance: ctx.role === 'owner',
        upcomingAppointments: selectUpcomingAppointments(upcomingAppointmentsRaw, now),
      }
    },
  ),
)

import 'server-only'
import { db } from '@ogun/db'
import {
  listActiveClientsWithLastMeasurement,
  listAppointmentsInRange,
  listLowSessionClientPackages,
  type AppointmentListRow,
} from '@ogun/db/queries'
import { withAuth } from '@/lib/authz'
import { withAudit } from '@/lib/audit'
import { isStaleMeasurementClient, STALE_MEASUREMENT_DAYS } from '@/lib/notifications/summary'

export interface AttentionClient {
  clientId: string
  clientName: string
  reason: string
}

export interface ClientsOperationSummary {
  todayAppointments: AppointmentListRow[]
  staleMeasurementClients: AttentionClient[]
  lowSessionClients: AttentionClient[]
}

function todayRange(now: Date) {
  return {
    from: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0),
    to: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999),
  }
}

export const getClientsOperationSummary = withAuth(
  withAudit(
    { action: 'read', entityType: 'client_operation_summary' },
    async (ctx): Promise<ClientsOperationSummary> => {
      const now = new Date()
      const assignedDietitianId = ctx.role === 'dietitian' ? ctx.user.id : undefined
      const visibility = { assignedDietitianId }
      const [todayAppointments, measurementClients, packageRows] = await Promise.all([
        listAppointmentsInRange(db, ctx.scope.clinicId, {
          ...todayRange(now),
          visibleToDietitianId: assignedDietitianId,
        }),
        listActiveClientsWithLastMeasurement(db, ctx.scope.clinicId, visibility),
        listLowSessionClientPackages(db, ctx.scope.clinicId, visibility),
      ])

      const lowSessionByClient = new Map<string, AttentionClient>()
      for (const item of packageRows) {
        const remaining = Math.max(item.sessionCount - item.sessionsUsed, 0)
        const current = lowSessionByClient.get(item.clientId)
        if (!current || remaining === 0) {
          lowSessionByClient.set(item.clientId, {
            clientId: item.clientId,
            clientName: `${item.clientFirstName} ${item.clientLastName}`,
            reason:
              remaining === 0
                ? `${item.packageName}: seans kalmadı`
                : `${item.packageName}: son 1 seans`,
          })
        }
      }

      return {
        todayAppointments,
        staleMeasurementClients: measurementClients
          .filter((client) => isStaleMeasurementClient(client, now))
          .map((client) => ({
            clientId: client.clientId,
            clientName: `${client.firstName} ${client.lastName}`,
            reason: `${STALE_MEASUREMENT_DAYS}+ gündür ölçüm yok`,
          })),
        lowSessionClients: [...lowSessionByClient.values()],
      }
    },
  ),
)

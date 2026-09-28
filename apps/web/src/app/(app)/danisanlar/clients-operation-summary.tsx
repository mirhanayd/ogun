'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowUpRight, CalendarPlus, Clock3 } from 'lucide-react'
import type { AppointmentListRow } from '@ogun/db/queries'
import { Button } from '@/components/ui/button'
import {
  AppointmentDialog,
  type AppointmentDialogPrefill,
  type DietitianOption,
} from '../randevular/appointment-dialog'
import {
  createAppointmentAction,
  getClientPackageWarningAction,
  searchClientsAction,
} from '../randevular/actions'
import type { AttentionClient } from './operation-queries'

export function ClientsOperationSummaryView({
  appointments,
  staleMeasurementClients,
  lowSessionClients,
  dietitians,
  defaultDietitianId,
}: {
  appointments: AppointmentListRow[]
  staleMeasurementClients: AttentionClient[]
  lowSessionClients: AttentionClient[]
  dietitians: DietitianOption[]
  defaultDietitianId?: string
}) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [prefill, setPrefill] = useState<AppointmentDialogPrefill>({ startsAt: new Date() })
  const router = useRouter()
  const hasAttention = staleMeasurementClients.length > 0 || lowSessionClients.length > 0

  if (appointments.length === 0 && !hasAttention) return null

  function openAppointment(client?: AttentionClient) {
    setPrefill({
      startsAt: new Date(),
      clientId: client?.clientId,
      clientName: client?.clientName,
    })
    setDialogOpen(true)
  }

  return (
    <>
      <section
        className={`grid border-y border-border ${appointments.length > 0 && hasAttention ? 'lg:grid-cols-2 lg:divide-x lg:divide-border' : ''}`}
      >
        {appointments.length > 0 ? (
          <div className="py-4 pr-0 lg:pr-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">Bugünün randevuları</h2>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => openAppointment()}
              >
                <CalendarPlus className="size-4" />
                Randevu ekle
              </Button>
            </div>
            <ul className="space-y-1">
              {appointments.slice(0, 5).map((appointment) => (
                <li key={appointment.id}>
                  <Link
                    href={`/danisanlar/${appointment.clientId}`}
                    className="group flex min-h-9 items-center gap-3 rounded-lg px-2 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="w-12 shrink-0 font-medium tabular-nums">
                      {appointment.startsAt.toLocaleTimeString('tr-TR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {appointment.clientFirstName} {appointment.clientLastName}
                    </span>
                    <ArrowUpRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {hasAttention ? (
          <div className="py-4 lg:pl-6">
            <div className="mb-3 flex items-center gap-2">
              <Clock3 className="size-4 text-amber-600 dark:text-amber-400" />
              <h2 className="text-sm font-semibold">Dikkat gerekiyor</h2>
            </div>
            <ul className="space-y-1">
              {staleMeasurementClients.slice(0, 3).map((client) => (
                <li
                  key={`measurement-${client.clientId}`}
                  className="flex min-h-10 items-center gap-3 rounded-lg px-2 text-sm hover:bg-muted"
                >
                  <Link
                    href={`/danisanlar/${client.clientId}`}
                    className="min-w-0 flex-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="block truncate font-medium">{client.clientName}</span>
                    <span className="block text-xs text-muted-foreground">{client.reason}</span>
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 shrink-0"
                    onClick={() => openAppointment(client)}
                  >
                    Randevu öner
                  </Button>
                </li>
              ))}
              {lowSessionClients.slice(0, 3).map((client) => (
                <li
                  key={`package-${client.clientId}`}
                  className="flex min-h-10 items-center gap-3 rounded-lg px-2 text-sm hover:bg-muted"
                >
                  <Link
                    href={`/danisanlar/${client.clientId}`}
                    className="min-w-0 flex-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="block truncate font-medium">{client.clientName}</span>
                    <span className="block text-xs text-muted-foreground">{client.reason}</span>
                  </Link>
                  <Button asChild variant="ghost" size="sm" className="h-8 shrink-0">
                    <Link href={`/danisanlar/${client.clientId}`}>Paket hatırlat</Link>
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <AppointmentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        dietitians={dietitians}
        defaultDietitianId={defaultDietitianId}
        prefill={prefill}
        onSearchClients={searchClientsAction}
        onGetPackageWarning={getClientPackageWarningAction}
        onSave={async (_appointmentId, _originalClientId, values, acknowledgeWarning) =>
          createAppointmentAction(values, acknowledgeWarning)
        }
        onSaved={() => router.refresh()}
      />
    </>
  )
}

import { CalendarDays, Clock3, MapPin } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/empty-state'
import { ClientWorkspaceHeader } from '@/screens/client-workspace'
import {
  APPOINTMENT_STATUS_LABELS_TR,
  APPOINTMENT_TYPE_LABELS_TR,
} from '@/lib/validation/appointment-schemas'

export interface ClientAppointmentViewRow {
  id: string
  startsAt: Date
  status: keyof typeof APPOINTMENT_STATUS_LABELS_TR
  type: keyof typeof APPOINTMENT_TYPE_LABELS_TR
  dietitianName: string
  location: string | null
  notes: string | null
}

export function ClientAppointmentsView({
  appointments,
}: {
  appointments: ClientAppointmentViewRow[]
}) {
  const upcomingCount = appointments.filter(
    (appointment) => appointment.startsAt.getTime() >= Date.now() && appointment.status !== 'iptal',
  ).length

  return (
    <div className="flex flex-col gap-6">
      <ClientWorkspaceHeader
        icon={CalendarDays}
        title="Randevular"
        description="Danışanın geçmiş ve yaklaşan görüşmelerini tek zaman çizgisinde izleyin."
        meta={`${upcomingCount} yaklaşan · ${appointments.length} toplam`}
      />
      {appointments.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Henüz randevu yok"
          description="İlk randevuyu danışan başlığındaki hızlı işlemden veya randevu takviminden planlayın."
        />
      ) : (
        <ol className="divide-y divide-border border-y border-border">
          {appointments.map((appointment) => (
            <li
              key={appointment.id}
              className="grid gap-3 py-4 sm:grid-cols-[8.5rem_minmax(0,1fr)_auto] sm:items-start"
            >
              <div className="flex items-baseline gap-2 sm:block">
                <p className="text-sm font-semibold tabular-nums">
                  {appointment.startsAt.toLocaleDateString('tr-TR', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
                  <Clock3 className="size-3.5" aria-hidden="true" />
                  {appointment.startsAt.toLocaleTimeString('tr-TR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {APPOINTMENT_TYPE_LABELS_TR[appointment.type]}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{appointment.dietitianName}</p>
                {appointment.location ? (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="size-3.5" aria-hidden="true" />
                    {appointment.location}
                  </p>
                ) : null}
                {appointment.notes ? (
                  <p className="mt-2 max-w-2xl text-sm leading-5 text-muted-foreground">
                    {appointment.notes}
                  </p>
                ) : null}
              </div>
              <Badge variant={appointment.status === 'iptal' ? 'destructive' : 'secondary'}>
                {APPOINTMENT_STATUS_LABELS_TR[appointment.status]}
              </Badge>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

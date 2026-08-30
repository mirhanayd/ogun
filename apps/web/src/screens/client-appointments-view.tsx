import { CalendarDays } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/empty-state'
import { APPOINTMENT_STATUS_LABELS_TR, APPOINTMENT_TYPE_LABELS_TR } from '@/lib/validation/appointment-schemas'

export interface ClientAppointmentViewRow { id: string; startsAt: Date; status: keyof typeof APPOINTMENT_STATUS_LABELS_TR; type: keyof typeof APPOINTMENT_TYPE_LABELS_TR; dietitianName: string; location: string | null; notes: string | null }

export function ClientAppointmentsView({ appointments }: { appointments: ClientAppointmentViewRow[] }) {
  if (appointments.length === 0) return <EmptyState icon={CalendarDays} title="Henüz randevu yok" description="Bu danışan için randevu planlamak üzere üst bardaki hızlı eylemleri veya /randevular takvimini kullanın." />
  return <div className="flex flex-col gap-2">{appointments.map((appointment) => <Card key={appointment.id}><CardContent className="flex items-center justify-between gap-4 py-3"><div><p className="text-sm font-medium">{appointment.startsAt.toLocaleDateString('tr-TR', { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric' })} · {appointment.startsAt.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</p><p className="text-xs text-muted-foreground">{appointment.dietitianName} · {APPOINTMENT_TYPE_LABELS_TR[appointment.type]}{appointment.location ? ` · ${appointment.location}` : ''}</p>{appointment.notes ? <p className="mt-1 text-xs text-muted-foreground">{appointment.notes}</p> : null}</div><Badge variant={appointment.status === 'iptal' ? 'destructive' : 'secondary'}>{APPOINTMENT_STATUS_LABELS_TR[appointment.status]}</Badge></CardContent></Card>)}</div>
}

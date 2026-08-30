import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DomainEntity, OgunRepositories } from '@/data/repositories'
import { AppointmentsView, type AppointmentsViewMode } from '@/screens/appointments-view'
import { AppointmentDialog } from '@/app/(app)/randevular/appointment-dialog'
import type { AppointmentListRow } from '@/app/(app)/randevular/types'
import type { AppointmentFormInput } from '@/lib/validation/appointment-schemas'

function addDays(date: Date, amount: number) { const next = new Date(date); next.setDate(next.getDate() + amount); return next }
function startOfWeek(date: Date) { const next = new Date(date); next.setDate(next.getDate() - (((next.getDay() + 6) % 7) + 1) + 1); next.setHours(0, 0, 0, 0); return next }

export function LocalAppointmentsAdapter({ repository, dietitianId, dietitianName, canManageHolidays }: { repository: OgunRepositories; dietitianId: string; dietitianName: string; canManageHolidays: boolean }) {
  const [view, setView] = useState<AppointmentsViewMode>('week')
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const [clients, setClients] = useState<DomainEntity[]>([])
  const [entities, setEntities] = useState<DomainEntity[]>([])
  const [createAt, setCreateAt] = useState<Date | null>(null)
  const [editAppointment, setEditAppointment] = useState<AppointmentListRow | null>(null)
  useEffect(() => {
    const load = async () => { const [nextClients, nextAppointments] = await Promise.all([repository.clients.list(), repository.appointments.list()]); setClients(nextClients); setEntities(nextAppointments) }
    void load(); window.addEventListener('ogun-local-data-changed', load)
    return () => window.removeEventListener('ogun-local-data-changed', load)
  }, [repository])
  const appointments = useMemo<AppointmentListRow[]>(() => entities.map((row) => {
    const client = clients.find((item) => item.id === row.clientId)
    return { id: row.id, clientId: String(row.clientId ?? ''), clientFirstName: String(client?.firstName ?? 'Danışan'), clientLastName: String(client?.lastName ?? ''), dietitianId: String(row.dietitianId ?? dietitianId), dietitianName: String(row.dietitianName ?? dietitianName), startsAt: new Date(String(row.startsAt)), endsAt: new Date(String(row.endsAt)), type: row.type === 'ilk_görüşme' || row.type === 'online' || row.type === 'ölçüm' ? row.type : 'kontrol', status: row.status === 'tamamlandı' ? 'geldi' : row.status === 'iptal' || row.status === 'gelmedi' || row.status === 'ertelendi' ? row.status : 'planlandı', location: typeof row.location === 'string' ? row.location : null, notes: typeof row.notes === 'string' ? row.notes : null, packageSessionId: null }
  }), [clients, entities, dietitianId, dietitianName])
  const days = useMemo(() => view === 'day' ? [currentDate] : view === 'week' ? Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(currentDate), index)) : [], [view, currentDate])
  const title = view === 'month' ? currentDate.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }) : view === 'week' ? `${days[0]?.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })} — ${days.at(-1)?.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })}` : currentDate.toLocaleDateString('tr-TR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
  function navigate(params: { view?: AppointmentsViewMode; date?: Date }) { if (params.view) setView(params.view); if (params.date) setCurrentDate(params.date) }
  const searchClients = useCallback(async (query: string) => {
    const normalized = query.toLocaleLowerCase('tr-TR').trim()
    return clients.filter((client) => `${String(client.firstName ?? '')} ${String(client.lastName ?? '')} ${String(client.phone ?? '')}`.toLocaleLowerCase('tr-TR').includes(normalized)).slice(0, 20).map((client) => ({ id: client.id, firstName: String(client.firstName ?? ''), lastName: String(client.lastName ?? ''), phone: typeof client.phone === 'string' ? client.phone : null }))
  }, [clients])
  const noPackageWarning = useCallback(async () => null, [])
  const saveAppointment = useCallback(async (appointmentId: string | null, _originalClientId: string | null, values: AppointmentFormInput) => {
    try {
      const startsAt = new Date(`${values.date}T${values.startTime}:00`)
      const existing = appointmentId ? entities.find((row) => row.id === appointmentId) : undefined
      await repository.appointments.upsert({ ...existing, id: appointmentId ?? crypto.randomUUID(), clientId: values.clientId, dietitianId: values.dietitianId, dietitianName, startsAt: startsAt.toISOString(), endsAt: new Date(startsAt.getTime() + values.durationMinutes * 60_000).toISOString(), type: values.type, status: existing?.status ?? 'planlandı', location: values.location || null, notes: values.notes || null, createdAt: existing?.createdAt ?? new Date().toISOString() })
      return { success: true }
    } catch (reason) {
      return { success: false, error: String(reason) }
    }
  }, [dietitianName, entities, repository.appointments])
  return <AppointmentsView view={view} currentDate={currentDate} title={title} days={days} dietitians={[{ id: dietitianId, name: dietitianName }]} selectedDietitianIds={[]} appointments={appointments} canManageHolidays={canManageHolidays} isDayOpen={() => true} onNavigate={navigate} onStep={(amount) => setCurrentDate((date) => view === 'month' ? new Date(date.getFullYear(), date.getMonth() + amount, 1) : addDays(date, amount * (view === 'week' ? 7 : 1)))} onToggleDietitian={() => undefined} onCreate={setCreateAt} onOpenHolidays={() => undefined} onOpenAppointment={setEditAppointment} onReschedule={async (appointment, startsAt) => repository.appointments.upsert({ ...entities.find((row) => row.id === appointment.id), id: appointment.id, startsAt: startsAt.toISOString(), endsAt: new Date(startsAt.getTime() + (appointment.endsAt.getTime() - appointment.startsAt.getTime())).toISOString() })} overlays={<><AppointmentDialog open={!!createAt} onOpenChange={(open) => !open && setCreateAt(null)} dietitians={[{ id: dietitianId, name: dietitianName }]} defaultDietitianId={dietitianId} prefill={createAt ? { startsAt: createAt } : undefined} onSearchClients={searchClients} onGetPackageWarning={noPackageWarning} onSave={saveAppointment} /><AppointmentDialog open={!!editAppointment} onOpenChange={(open) => !open && setEditAppointment(null)} dietitians={[{ id: dietitianId, name: dietitianName }]} appointment={editAppointment ?? undefined} onSearchClients={searchClients} onGetPackageWarning={noPackageWarning} onSave={saveAppointment} /></>} />
}

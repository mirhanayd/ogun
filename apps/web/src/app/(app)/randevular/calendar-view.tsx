'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { toastActionError } from '@/lib/action-toast'
import { checkWorkingHours, computeRescheduleUpdate, type HolidayRow, type WorkingHourRow } from '@/lib/scheduling'
import { AppointmentsView, type AppointmentsViewMode } from '@/screens/appointments-view'
import { AppointmentDialog, type DietitianOption } from './appointment-dialog'
import { AppointmentDetailSheet } from './appointment-detail-sheet'
import { HolidayManagerDialog, type HolidayRow as HolidayManagerRow } from './holiday-manager-dialog'
import { rescheduleAppointmentAction } from './actions'
import type { AppointmentListRow } from './types'

export type CalendarViewMode = AppointmentsViewMode

function addDays(date: Date, amount: number) { const next = new Date(date); next.setDate(next.getDate() + amount); return next }
function startOfWeek(date: Date) { const day = new Date(date); const iso = ((day.getDay() + 6) % 7) + 1; day.setDate(day.getDate() - iso + 1); day.setHours(0, 0, 0, 0); return day }

export function CalendarView({ view, currentDate, dietitians, selectedDietitianIds, appointments, workingHours, holidays, canManageHolidays }: {
  view: CalendarViewMode
  currentDate: Date
  dietitians: DietitianOption[]
  selectedDietitianIds: string[]
  appointments: AppointmentListRow[]
  workingHours: WorkingHourRow[]
  holidays: HolidayRow[]
  canManageHolidays: boolean
}) {
  const router = useRouter()
  const [createDialog, setCreateDialog] = useState<{ startsAt: Date } | null>(null)
  const [editAppointment, setEditAppointment] = useState<AppointmentListRow | null>(null)
  const [detailAppointmentId, setDetailAppointmentId] = useState<string | null>(null)
  const [holidayDialogOpen, setHolidayDialogOpen] = useState(false)
  function navigate(params: { view?: CalendarViewMode; date?: Date; dietitianIds?: string[] }) {
    const search = new URLSearchParams(); search.set('view', params.view ?? view); search.set('date', (params.date ?? currentDate).toISOString().slice(0, 10))
    const ids = params.dietitianIds ?? selectedDietitianIds; if (ids.length > 0) search.set('dietitian', ids.join(','))
    router.push(`/randevular?${search.toString()}`)
  }
  function step(amount: number) { navigate({ date: view === 'month' ? new Date(currentDate.getFullYear(), currentDate.getMonth() + amount, 1) : addDays(currentDate, amount * (view === 'week' ? 7 : 1)) }) }
  function toggleDietitian(id: string) { navigate({ dietitianIds: selectedDietitianIds.includes(id) ? selectedDietitianIds.filter((value) => value !== id) : [...selectedDietitianIds, id] }) }
  const days = useMemo(() => view === 'day' ? [currentDate] : view === 'week' ? Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(currentDate), index)) : [], [view, currentDate])
  const isDayOpen = useCallback((day: Date) => !checkWorkingHours(new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12), new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12, 30), workingHours, holidays).outside, [workingHours, holidays])
  const handleReschedule = useCallback(async (appointment: AppointmentListRow, newStart: Date) => {
    const { startsAt, endsAt } = computeRescheduleUpdate({ startsAt: appointment.startsAt, endsAt: appointment.endsAt }, { droppedSlotStart: newStart })
    let result = await rescheduleAppointmentAction(appointment.id, appointment.dietitianId, appointment.clientId, startsAt, endsAt)
    if (result.warning && window.confirm(`${result.warning}\n\nYine de ertelensin mi?`)) result = await rescheduleAppointmentAction(appointment.id, appointment.dietitianId, appointment.clientId, startsAt, endsAt, true)
    if (!result.success) { toastActionError(result.error ?? 'Randevu ertelenemedi.', 'Randevu eski saatinde duruyor.'); return }
    toast.success('Randevu ertelendi'); router.refresh()
  }, [router])
  const title = useMemo(() => {
    if (view === 'month') return currentDate.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
    if (view === 'week' && days.length) return `${days[0]!.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })} — ${days.at(-1)!.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })}`
    return currentDate.toLocaleDateString('tr-TR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
  }, [view, currentDate, days])
  return <AppointmentsView view={view} currentDate={currentDate} title={title} days={days} dietitians={dietitians} selectedDietitianIds={selectedDietitianIds} appointments={appointments} canManageHolidays={canManageHolidays} isDayOpen={isDayOpen} onNavigate={navigate} onStep={step} onToggleDietitian={toggleDietitian} onCreate={(startsAt) => setCreateDialog({ startsAt })} onOpenHolidays={() => setHolidayDialogOpen(true)} onOpenAppointment={(appointment) => setDetailAppointmentId(appointment.id)} onReschedule={handleReschedule} overlays={<>
    <AppointmentDialog open={!!createDialog} onOpenChange={(open) => !open && setCreateDialog(null)} dietitians={dietitians} defaultDietitianId={selectedDietitianIds[0]} prefill={createDialog ? { startsAt: createDialog.startsAt } : undefined} />
    <AppointmentDialog open={!!editAppointment} onOpenChange={(open) => !open && setEditAppointment(null)} dietitians={dietitians} appointment={editAppointment ?? undefined} />
    <AppointmentDetailSheet appointmentId={detailAppointmentId} open={!!detailAppointmentId} onOpenChange={(open) => !open && setDetailAppointmentId(null)} onEdit={() => { const appointment = appointments.find((row) => row.id === detailAppointmentId); if (appointment) { setEditAppointment(appointment); setDetailAppointmentId(null) } }} />
    {canManageHolidays ? <HolidayManagerDialog open={holidayDialogOpen} onOpenChange={setHolidayDialogOpen} holidays={holidays as HolidayManagerRow[]} /> : null}
  </>} />
}

'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarPlus, ChevronLeft, ChevronRight, PartyPopper } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { checkWorkingHours, computeRescheduleUpdate, type HolidayRow, type WorkingHourRow } from '@/lib/scheduling'
import { CalendarGrid, dietitianColor } from './calendar-grid'
import { MonthGrid } from './month-grid'
import { AppointmentDialog, type DietitianOption } from './appointment-dialog'
import { AppointmentDetailSheet } from './appointment-detail-sheet'
import { HolidayManagerDialog, type HolidayRow as HolidayManagerRow } from './holiday-manager-dialog'
import { rescheduleAppointmentAction } from './actions'
import type { AppointmentListRow } from './types'

export type CalendarViewMode = 'day' | 'week' | 'month'

function startOfWeek(date: Date): Date {
  const day = new Date(date)
  const isoWeekday = ((day.getDay() + 6) % 7) + 1
  day.setDate(day.getDate() - (isoWeekday - 1))
  day.setHours(0, 0, 0, 0)
  return day
}

function addDays(date: Date, amount: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

// GitHub issue #39 / Prompt 7.1, GÖREV 2 — takvim kabuğu: görünüm anahtarı
// (gün/hafta/ay), tarih gezinme, diyetisyen filtresi, ve alttaki tüm
// dialog'ların (oluştur/düzenle/detay/tatil) orkestrasyon durumu BURADA.
// Veri (appointments/dietitians/workingHours/holidays) page.tsx'te (sunucu
// bileşeni) URL query string'ine göre (?view=&date=&dietitian=) ÖNCEDEN
// çekilip prop olarak geliyor — clients-table.tsx/danisanlar/page.tsx'teki
// AYNI "URL = durum" deseni (bkz. o dosyanın üstündeki not). Bir mutasyon
// sonrası router.refresh() ile sunucu verisi tazelenir, TEKRAR router.push
// gerekmez (URL zaten aynı).
export function CalendarView({
  view,
  currentDate,
  dietitians,
  selectedDietitianIds,
  appointments,
  workingHours,
  holidays,
}: {
  view: CalendarViewMode
  currentDate: Date
  dietitians: DietitianOption[]
  selectedDietitianIds: string[]
  appointments: AppointmentListRow[]
  workingHours: WorkingHourRow[]
  holidays: HolidayRow[]
}) {
  const router = useRouter()
  const [createDialog, setCreateDialog] = useState<{ startsAt: Date } | null>(null)
  const [editAppointment, setEditAppointment] = useState<AppointmentListRow | null>(null)
  const [detailAppointmentId, setDetailAppointmentId] = useState<string | null>(null)
  const [holidayDialogOpen, setHolidayDialogOpen] = useState(false)

  const dietitianOrder = useMemo(() => dietitians.map((d) => d.id), [dietitians])

  function navigate(params: { view?: CalendarViewMode; date?: Date; dietitianIds?: string[] }) {
    const search = new URLSearchParams()
    search.set('view', params.view ?? view)
    search.set('date', (params.date ?? currentDate).toISOString().slice(0, 10))
    const dietitianIds = params.dietitianIds ?? selectedDietitianIds
    if (dietitianIds.length > 0) search.set('dietitian', dietitianIds.join(','))
    router.push(`/randevular?${search.toString()}`)
  }

  function step(amount: number) {
    if (view === 'month') {
      navigate({ date: new Date(currentDate.getFullYear(), currentDate.getMonth() + amount, 1) })
    } else if (view === 'week') {
      navigate({ date: addDays(currentDate, amount * 7) })
    } else {
      navigate({ date: addDays(currentDate, amount) })
    }
  }

  function toggleDietitian(id: string) {
    const next = selectedDietitianIds.includes(id)
      ? selectedDietitianIds.filter((d) => d !== id)
      : [...selectedDietitianIds, id]
    navigate({ dietitianIds: next })
  }

  const days = useMemo(() => {
    if (view === 'day') return [currentDate]
    if (view === 'week') {
      const start = startOfWeek(currentDate)
      return Array.from({ length: 7 }, (_, index) => addDays(start, index))
    }
    return []
  }, [view, currentDate])

  const isDayOpen = useCallback(
    (day: Date) => {
      const hours = checkWorkingHours(
        new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12, 0),
        new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12, 30),
        workingHours,
        holidays,
      )
      return !hours.outside
    },
    [workingHours, holidays],
  )

  const handleReschedule = useCallback(
    async (appointment: AppointmentListRow, newStart: Date) => {
      const { startsAt, endsAt } = computeRescheduleUpdate(
        { startsAt: appointment.startsAt, endsAt: appointment.endsAt },
        { droppedSlotStart: newStart },
      )
      const result = await rescheduleAppointmentAction(
        appointment.id,
        appointment.dietitianId,
        appointment.clientId,
        startsAt,
        endsAt,
      )
      if (result.warning) {
        const confirmed = window.confirm(`${result.warning}\n\nYine de ertelensin mi?`)
        if (confirmed) {
          const retry = await rescheduleAppointmentAction(
            appointment.id,
            appointment.dietitianId,
            appointment.clientId,
            startsAt,
            endsAt,
            true,
          )
          if (!retry.success) {
            toast.error(retry.error ?? 'Randevu ertelenemedi.')
            return
          }
          toast.success('Randevu ertelendi')
          router.refresh()
        }
        return
      }
      if (!result.success) {
        toast.error(result.error ?? 'Randevu ertelenemedi.')
        return
      }
      toast.success('Randevu ertelendi')
      router.refresh()
    },
    [router],
  )

  const title = useMemo(() => {
    if (view === 'month') {
      return currentDate.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
    }
    if (view === 'week' && days.length > 0) {
      const first = days[0]!
      const last = days[days.length - 1]!
      return `${first.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })} — ${last.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })}`
    }
    return currentDate.toLocaleDateString('tr-TR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
  }, [view, currentDate, days])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => step(-1)} aria-label="Önceki">
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate({ date: new Date() })}>
            Bugün
          </Button>
          <Button variant="outline" size="icon" onClick={() => step(1)} aria-label="Sonraki">
            <ChevronRight className="size-4" />
          </Button>
          <h1 className="ml-2 text-base font-semibold capitalize">{title}</h1>
        </div>

        <div className="flex items-center gap-2">
          <Tabs value={view} onValueChange={(value) => navigate({ view: value as CalendarViewMode })}>
            <TabsList>
              <TabsTrigger value="day">Gün</TabsTrigger>
              <TabsTrigger value="week">Hafta</TabsTrigger>
              <TabsTrigger value="month">Ay</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="outline" size="sm" onClick={() => setHolidayDialogOpen(true)} className="gap-1.5">
            <PartyPopper className="size-4" />
            Tatiller
          </Button>
          <Button size="sm" onClick={() => setCreateDialog({ startsAt: currentDate })} className="gap-1.5">
            <CalendarPlus className="size-4" />
            Yeni randevu
          </Button>
        </div>
      </div>

      {dietitians.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Diyetisyen:</span>
          {dietitians.map((dietitian) => {
            const active = selectedDietitianIds.length === 0 || selectedDietitianIds.includes(dietitian.id)
            const color = dietitianColor(dietitian.id, dietitianOrder)
            return (
              <button
                key={dietitian.id}
                type="button"
                onClick={() => toggleDietitian(dietitian.id)}
                className={cn(!active && 'opacity-40')}
              >
                <Badge variant="outline" className={cn('gap-1.5 border', color.border, active && color.bg, color.text)}>
                  {dietitian.name}
                </Badge>
              </button>
            )
          })}
        </div>
      )}

      {view === 'month' ? (
        <MonthGrid
          monthDate={currentDate}
          appointments={appointments}
          dietitianOrder={dietitianOrder}
          onDayClick={(day) => navigate({ view: 'day', date: day })}
          onAppointmentClick={(appointment) => setDetailAppointmentId(appointment.id)}
        />
      ) : (
        <CalendarGrid
          days={days}
          appointments={appointments}
          dietitianOrder={dietitianOrder}
          isDayOpen={isDayOpen}
          onSlotClick={(date) => setCreateDialog({ startsAt: date })}
          onAppointmentClick={(appointment) => setDetailAppointmentId(appointment.id)}
          onReschedule={handleReschedule}
        />
      )}

      <AppointmentDialog
        open={!!createDialog}
        onOpenChange={(open) => !open && setCreateDialog(null)}
        dietitians={dietitians}
        defaultDietitianId={selectedDietitianIds[0]}
        prefill={createDialog ? { startsAt: createDialog.startsAt } : undefined}
      />

      <AppointmentDialog
        open={!!editAppointment}
        onOpenChange={(open) => !open && setEditAppointment(null)}
        dietitians={dietitians}
        appointment={editAppointment ?? undefined}
      />

      <AppointmentDetailSheet
        appointmentId={detailAppointmentId}
        open={!!detailAppointmentId}
        onOpenChange={(open) => !open && setDetailAppointmentId(null)}
        onEdit={() => {
          const appointment = appointments.find((a) => a.id === detailAppointmentId)
          if (appointment) {
            setEditAppointment(appointment)
            setDetailAppointmentId(null)
          }
        }}
      />

      <HolidayManagerDialog
        open={holidayDialogOpen}
        onOpenChange={setHolidayDialogOpen}
        holidays={holidays as HolidayManagerRow[]}
      />
    </div>
  )
}

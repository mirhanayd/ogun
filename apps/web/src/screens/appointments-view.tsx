import type { ReactNode } from 'react'
import { CalendarPlus, ChevronLeft, ChevronRight, PartyPopper } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/components/empty-state'
import { cn } from '@/lib/utils'
import { CalendarGrid, dietitianColor } from '@/app/(app)/randevular/calendar-grid'
import { MonthGrid } from '@/app/(app)/randevular/month-grid'
import type { AppointmentListRow } from '@/app/(app)/randevular/types'
import type { DietitianOption } from '@/app/(app)/randevular/appointment-dialog'

export type AppointmentsViewMode = 'day' | 'week' | 'month'

export function AppointmentsView({ view, currentDate, title, days, dietitians, selectedDietitianIds, appointments, canManageHolidays, isDayOpen, onNavigate, onStep, onToggleDietitian, onCreate, onOpenHolidays, onOpenAppointment, onReschedule, overlays }: {
  view: AppointmentsViewMode
  currentDate: Date
  title: string
  days: Date[]
  dietitians: DietitianOption[]
  selectedDietitianIds: string[]
  appointments: AppointmentListRow[]
  canManageHolidays: boolean
  isDayOpen: (day: Date) => boolean
  onNavigate: (params: { view?: AppointmentsViewMode; date?: Date }) => void
  onStep: (amount: number) => void
  onToggleDietitian: (id: string) => void
  onCreate: (date: Date) => void
  onOpenHolidays: () => void
  onOpenAppointment: (appointment: AppointmentListRow) => void
  onReschedule: (appointment: AppointmentListRow, date: Date) => Promise<void>
  overlays?: ReactNode
}) {
  const dietitianOrder = dietitians.map((dietitian) => dietitian.id)
  return <div className="flex flex-col gap-4" data-appointments-view>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => onStep(-1)} aria-label="Önceki"><ChevronLeft className="size-4" /></Button>
        <Button variant="outline" size="sm" onClick={() => onNavigate({ date: new Date() })}>Bugün</Button>
        <Button variant="outline" size="icon" onClick={() => onStep(1)} aria-label="Sonraki"><ChevronRight className="size-4" /></Button>
        <h1 className="ml-2 text-base font-semibold capitalize">{title}</h1>
      </div>
      <div className="flex items-center gap-2">
        <Tabs value={view} onValueChange={(value) => onNavigate({ view: value as AppointmentsViewMode })}><TabsList><TabsTrigger value="day">Gün</TabsTrigger><TabsTrigger value="week">Hafta</TabsTrigger><TabsTrigger value="month">Ay</TabsTrigger></TabsList></Tabs>
        {canManageHolidays ? <Button variant="outline" size="sm" onClick={onOpenHolidays} className="gap-1.5"><PartyPopper className="size-4" />Tatiller</Button> : null}
        <Button size="sm" onClick={() => onCreate(currentDate)} className="gap-1.5"><CalendarPlus className="size-4" />Yeni randevu</Button>
      </div>
    </div>
    {dietitians.length > 1 ? <div className="flex flex-wrap items-center gap-1.5"><span className="text-xs text-muted-foreground">Diyetisyen:</span>{dietitians.map((dietitian) => {
      const active = selectedDietitianIds.length === 0 || selectedDietitianIds.includes(dietitian.id)
      const color = dietitianColor(dietitian.id, dietitianOrder)
      return <button key={dietitian.id} type="button" onClick={() => onToggleDietitian(dietitian.id)} className={cn(!active && 'opacity-40')}><Badge variant="outline" className={cn('gap-1.5 border', color.border, active && color.bg, color.text)}>{dietitian.name}</Badge></button>
    })}</div> : null}
    {appointments.length === 0 ? <EmptyState variant="inline" icon={CalendarPlus} title="Bu aralıkta randevu yok" description={selectedDietitianIds.length > 0 ? 'Seçili diyetisyen filtresine uyan randevu bulunamadı. Filtreyi kaldırabilir ya da yeni bir randevu oluşturabilirsiniz.' : 'Takvimde boş bir saat kutusuna tıklayarak ya da aşağıdaki düğmeyle randevu oluşturabilirsiniz.'} action={{ label: 'Yeni randevu', onClick: () => onCreate(currentDate) }} /> : null}
    {view === 'month' ? <MonthGrid monthDate={currentDate} appointments={appointments} dietitianOrder={dietitianOrder} onDayClick={(day) => onNavigate({ view: 'day', date: day })} onAppointmentClick={onOpenAppointment} /> : <CalendarGrid days={days} appointments={appointments} dietitianOrder={dietitianOrder} isDayOpen={isDayOpen} onSlotClick={onCreate} onAppointmentClick={onOpenAppointment} onReschedule={onReschedule} />}
    {overlays}
  </div>
}

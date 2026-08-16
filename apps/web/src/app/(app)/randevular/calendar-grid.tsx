'use client'

import { useMemo } from 'react'
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { cn } from '@/lib/utils'
import { assignLanes } from '@/lib/calendar-layout'
import { DIETITIAN_COLOR_PALETTE } from '@/lib/validation/appointment-schemas'
import type { AppointmentListRow } from './types'

// GitHub issue #39 / Prompt 7.1, GÖREV 2 — Gün/Hafta grid'i. Sabit bir saat
// aralığı (08:00-20:00, 30 dk slot) BİLİNÇLİ bir basitleştirme: klinik
// çalışma saatleri farklı günlerde değişebildiği için (bkz. clinicWorkingHours)
// grid'i HER klinik için dinamik hesaplamak yerine, çoğu klinik mesaisini
// kapsayan sabit bir pencere kullanılıyor — mesai dışı saatler (GÖREV 3
// uyarısı zaten randevu formunda ayrıca kontrol ediliyor) grid'de soluk
// (bg-muted/40) gösterilir, tamamen gizlenmez (diyetisyen istisnai bir mesai
// dışı randevuyu buradan da görebilsin/tıklayabilsin diye).
const START_HOUR = 8
const END_HOUR = 20
const SLOT_MINUTES = 30
const SLOT_HEIGHT_PX = 40
const SLOTS_PER_DAY = ((END_HOUR - START_HOUR) * 60) / SLOT_MINUTES

function slotTimes(): { hour: number; minute: number }[] {
  const slots: { hour: number; minute: number }[] = []
  for (let i = 0; i < SLOTS_PER_DAY; i++) {
    const totalMinutes = START_HOUR * 60 + i * SLOT_MINUTES
    slots.push({ hour: Math.floor(totalMinutes / 60), minute: totalMinutes % 60 })
  }
  return slots
}

function slotDate(day: Date, hour: number, minute: number): Date {
  const date = new Date(day)
  date.setHours(hour, minute, 0, 0)
  return date
}

function isOutsideGridWindow(minutesFromStart: number, durationMinutes: number): boolean {
  return minutesFromStart < 0 || minutesFromStart + durationMinutes > SLOTS_PER_DAY * SLOT_MINUTES
}

export function dietitianColor(dietitianId: string, dietitianOrder: string[]) {
  const index = dietitianOrder.indexOf(dietitianId)
  // Modulo garanti eder ki sonuç her zaman dizinin sınırları içinde —
  // noUncheckedIndexedAccess yine de 'undefined' ihtimalini işaretlediği
  // için ilk elemana (her zaman tanımlı) düşen bir yedek ile daraltılıyor.
  return (
    DIETITIAN_COLOR_PALETTE[(index === -1 ? 0 : index) % DIETITIAN_COLOR_PALETTE.length] ??
    DIETITIAN_COLOR_PALETTE[0]
  )
}

function AppointmentBlock({
  appointment,
  day,
  dietitianOrder,
  lane,
  laneCount,
  onClick,
}: {
  appointment: AppointmentListRow
  day: Date
  dietitianOrder: string[]
  lane: number
  laneCount: number
  onClick: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `appointment:${appointment.id}`,
    data: { appointment },
  })

  const dayStart = new Date(day)
  dayStart.setHours(START_HOUR, 0, 0, 0)
  const minutesFromStart = (appointment.startsAt.getTime() - dayStart.getTime()) / 60000
  const durationMinutes = (appointment.endsAt.getTime() - appointment.startsAt.getTime()) / 60000
  if (isOutsideGridWindow(minutesFromStart, durationMinutes)) return null

  const color = dietitianColor(appointment.dietitianId, dietitianOrder)
  const top = (minutesFromStart / SLOT_MINUTES) * SLOT_HEIGHT_PX
  const height = Math.max((durationMinutes / SLOT_MINUTES) * SLOT_HEIGHT_PX - 2, 18)
  const widthPct = 100 / laneCount
  const leftPct = widthPct * lane

  return (
    <button
      ref={setNodeRef}
      type="button"
      {...listeners}
      {...attributes}
      onClick={onClick}
      style={{
        top,
        height,
        width: `calc(${widthPct}% - 2px)`,
        left: `${leftPct}%`,
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
      }}
      className={cn(
        'absolute z-10 overflow-hidden rounded-md border px-1.5 py-0.5 text-left text-[11px] leading-tight shadow-sm transition-shadow hover:shadow-md',
        color.bg,
        color.border,
        color.text,
        isDragging && 'z-20 opacity-70',
        appointment.status === 'iptal' && 'opacity-50 line-through',
      )}
    >
      <span className="block truncate font-medium">
        {appointment.clientFirstName} {appointment.clientLastName}
      </span>
      <span className="block truncate opacity-80">
        {appointment.startsAt.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} · {appointment.dietitianName}
      </span>
    </button>
  )
}

function SlotCell({ id, muted, onClick }: { id: string; muted: boolean; onClick: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      onClick={onClick}
      style={{ height: SLOT_HEIGHT_PX }}
      className={cn(
        'cursor-pointer border-b border-border/60 transition-colors hover:bg-accent/60',
        muted && 'bg-muted/40',
        isOver && 'bg-primary/15',
      )}
    />
  )
}

export interface CalendarGridProps {
  days: Date[]
  appointments: AppointmentListRow[]
  dietitianOrder: string[]
  isDayOpen: (day: Date) => boolean
  onSlotClick: (date: Date) => void
  onAppointmentClick: (appointment: AppointmentListRow) => void
  onReschedule: (appointment: AppointmentListRow, newStart: Date) => void
}

export function CalendarGrid({
  days,
  appointments,
  dietitianOrder,
  isDayOpen,
  onSlotClick,
  onAppointmentClick,
  onReschedule,
}: CalendarGridProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const slots = useMemo(() => slotTimes(), [])

  const appointmentsByDay = useMemo(() => {
    const map = new Map<string, AppointmentListRow[]>()
    for (const day of days) {
      const key = day.toDateString()
      map.set(
        key,
        appointments.filter((appointment) => appointment.startsAt.toDateString() === key),
      )
    }
    return map
  }, [days, appointments])

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return
    const appointment = active.data.current?.appointment as AppointmentListRow | undefined
    if (!appointment) return
    const [, dayIso, hourStr, minuteStr] = String(over.id).split(':')
    if (!dayIso) return
    const day = new Date(dayIso)
    const newStart = slotDate(day, Number(hourStr), Number(minuteStr))
    if (newStart.getTime() === appointment.startsAt.getTime()) return
    onReschedule(appointment, newStart)
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex overflow-x-auto rounded-lg border border-border">
        <div className="sticky left-0 z-10 flex w-14 shrink-0 flex-col bg-background">
          <div className="h-10 border-b border-border" />
          {slots.map((slot, index) => (
            <div key={index} style={{ height: SLOT_HEIGHT_PX }} className="border-b border-border/60 pr-1 text-right text-[10px] text-muted-foreground">
              {slot.minute === 0 ? `${String(slot.hour).padStart(2, '0')}:00` : ''}
            </div>
          ))}
        </div>
        {days.map((day) => {
          const dayAppointments = appointmentsByDay.get(day.toDateString()) ?? []
          const lanes = assignLanes(dayAppointments)
          const laneById = new Map(lanes.map((entry) => [entry.id, entry]))
          const open = isDayOpen(day)
          return (
            <div key={day.toISOString()} className="relative w-40 shrink-0 grow border-l border-border first:border-l-0">
              <div className="sticky top-0 z-10 flex h-10 flex-col items-center justify-center border-b border-border bg-background text-xs font-medium">
                <span>{day.toLocaleDateString('tr-TR', { weekday: 'short' })}</span>
                <span className="text-muted-foreground">{day.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' })}</span>
              </div>
              <div className="relative">
                {slots.map((slot, index) => (
                  <SlotCell
                    key={index}
                    id={`slot:${day.toDateString()}:${slot.hour}:${slot.minute}`}
                    muted={!open}
                    onClick={() => onSlotClick(slotDate(day, slot.hour, slot.minute))}
                  />
                ))}
                {dayAppointments.map((appointment) => {
                  const lane = laneById.get(appointment.id)
                  return (
                    <AppointmentBlock
                      key={appointment.id}
                      appointment={appointment}
                      day={day}
                      dietitianOrder={dietitianOrder}
                      lane={lane?.lane ?? 0}
                      laneCount={lane?.laneCount ?? 1}
                      onClick={() => onAppointmentClick(appointment)}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </DndContext>
  )
}

'use client'

import { cn } from '@/lib/utils'
import { dietitianColor } from './calendar-grid'
import type { AppointmentListRow } from './types'

// GitHub issue #39 / Prompt 7.1, GÖREV 2 — Ay görünümü. Sürükle-erteleme
// BİLEREK BURADA YOK: bir ay hücresi tek bir "gün" temsil ediyor, dakika
// hassasiyetli bir hedef yok — dosya başı PR notunda da belirtildiği gibi,
// ay görünümünde erteleme "günü değiştir" gibi daha kaba bir işlem olurdu
// ve UX olarak gün/hafta görünümüne geçip oradan sürüklemek zaten daha
// doğru bir akış (bir hücreye tıklamak zaten o güne geçiyor, bkz. onDayClick).
const MAX_VISIBLE_PER_DAY = 3

function startOfMonthGrid(monthDate: Date): Date {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
  const isoWeekday = ((first.getDay() + 6) % 7) + 1 // 1 = Pazartesi
  const start = new Date(first)
  start.setDate(first.getDate() - (isoWeekday - 1))
  return start
}

export function MonthGrid({
  monthDate,
  appointments,
  dietitianOrder,
  onDayClick,
  onAppointmentClick,
}: {
  monthDate: Date
  appointments: AppointmentListRow[]
  dietitianOrder: string[]
  onDayClick: (day: Date) => void
  onAppointmentClick: (appointment: AppointmentListRow) => void
}) {
  const gridStart = startOfMonthGrid(monthDate)
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart)
    date.setDate(gridStart.getDate() + index)
    return date
  })
  const today = new Date().toDateString()

  const byDay = new Map<string, AppointmentListRow[]>()
  for (const appointment of appointments) {
    const key = appointment.startsAt.toDateString()
    byDay.set(key, [...(byDay.get(key) ?? []), appointment])
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="grid grid-cols-7 border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground">
        {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map((label) => (
          <div key={label} className="px-2 py-1.5 text-center">
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const dayAppointments = (byDay.get(day.toDateString()) ?? []).sort(
            (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
          )
          const inMonth = day.getMonth() === monthDate.getMonth()
          const isToday = day.toDateString() === today
          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onDayClick(day)}
              className={cn(
                'flex min-h-24 flex-col gap-0.5 border-b border-r border-border p-1 text-left align-top transition-colors hover:bg-accent/50',
                !inMonth && 'bg-muted/20 text-muted-foreground',
              )}
            >
              <span
                className={cn(
                  'flex size-5 items-center justify-center rounded-full text-[11px]',
                  isToday && 'bg-primary text-primary-foreground',
                )}
              >
                {day.getDate()}
              </span>
              <div className="flex flex-col gap-0.5">
                {dayAppointments.slice(0, MAX_VISIBLE_PER_DAY).map((appointment) => {
                  const color = dietitianColor(appointment.dietitianId, dietitianOrder)
                  return (
                    <span
                      key={appointment.id}
                      role="button"
                      tabIndex={0}
                      onClick={(event) => {
                        event.stopPropagation()
                        onAppointmentClick(appointment)
                      }}
                      className={cn(
                        'truncate rounded border px-1 py-px text-[10px]',
                        color.bg,
                        color.border,
                        color.text,
                      )}
                    >
                      {appointment.startsAt.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}{' '}
                      {appointment.clientFirstName}
                    </span>
                  )
                })}
                {dayAppointments.length > MAX_VISIBLE_PER_DAY && (
                  <span className="text-[10px] text-muted-foreground">
                    +{dayAppointments.length - MAX_VISIBLE_PER_DAY} daha
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

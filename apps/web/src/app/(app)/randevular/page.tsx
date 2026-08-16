import { CalendarView, type CalendarViewMode } from './calendar-view'
import {
  getCalendarAppointments,
  getDietitianOptions,
  getWorkingHoursAndHolidays,
} from './queries'

// GitHub issue #39 / Prompt 7.1 — Randevu takvimi. Önceki (GitHub issue #11)
// stub'ın yerini alıyor. Sunucu bileşeni SADECE URL query string'ini
// (?view=&date=&dietitian=) okuyup görünen aralığa göre veri çeker —
// gezinme/filtre durumu istemci state'inde DEĞİL URL'de (bkz. danisanlar/
// page.tsx'teki AYNI desen, calendar-view.tsx dosya başı notu).
function readParam(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function parseView(value: string | undefined): CalendarViewMode {
  return value === 'day' || value === 'month' ? value : 'week'
}

function parseDate(value: string | undefined): Date {
  if (value) {
    const parsed = new Date(`${value}T00:00:00`)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today
}

function rangeForView(view: CalendarViewMode, date: Date): { from: Date; to: Date } {
  if (view === 'day') {
    const from = new Date(date)
    from.setHours(0, 0, 0, 0)
    const to = new Date(date)
    to.setHours(23, 59, 59, 999)
    return { from, to }
  }
  if (view === 'week') {
    const isoWeekday = ((date.getDay() + 6) % 7) + 1
    const from = new Date(date)
    from.setDate(date.getDate() - (isoWeekday - 1))
    from.setHours(0, 0, 0, 0)
    const to = new Date(from)
    to.setDate(from.getDate() + 6)
    to.setHours(23, 59, 59, 999)
    return { from, to }
  }
  // month — takvim ızgarası ayın öncesi/sonrasından birkaç gün gösterir
  // (bkz. month-grid.tsx startOfMonthGrid), bu yüzden aralık biraz daha
  // geniş tutuluyor.
  const from = new Date(date.getFullYear(), date.getMonth() - 1, 25)
  const to = new Date(date.getFullYear(), date.getMonth() + 2, 5)
  return { from, to }
}

export default async function RandevularPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const view = parseView(readParam(params.view))
  const currentDate = parseDate(readParam(params.date))
  const dietitianParam = readParam(params.dietitian)
  const selectedDietitianIds = dietitianParam ? dietitianParam.split(',').filter(Boolean) : []

  const range = rangeForView(view, currentDate)

  const [appointments, dietitians, { workingHours, holidays }] = await Promise.all([
    getCalendarAppointments({
      from: range.from,
      to: range.to,
      dietitianIds: selectedDietitianIds.length > 0 ? selectedDietitianIds : undefined,
    }),
    getDietitianOptions(),
    getWorkingHoursAndHolidays(),
  ])

  return (
    <CalendarView
      view={view}
      currentDate={currentDate}
      dietitians={dietitians}
      selectedDietitianIds={selectedDietitianIds}
      appointments={appointments}
      workingHours={workingHours}
      holidays={holidays}
    />
  )
}

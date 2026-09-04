import type { ClientListRow } from '@ogun/db/queries'
import { APPOINTMENT_STATUS_LABELS_TR } from '@/lib/validation/appointment-schemas'

function shortDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
}

export function formatLastMeasurement(
  row: Pick<ClientListRow, 'lastMeasurementAt' | 'lastMeasurementWeightKg'>,
): string {
  if (!row.lastMeasurementAt) return '—'
  const weight = Number(row.lastMeasurementWeightKg)
  const weightLabel = Number.isFinite(weight)
    ? `${weight.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} kg`
    : null
  const dateLabel = shortDate(row.lastMeasurementAt)
  return weightLabel ? `${weightLabel} · ${dateLabel}` : dateLabel
}

export function formatLastAppointment(
  row: Pick<ClientListRow, 'lastAppointmentAt' | 'lastAppointmentStatus'>,
): string {
  if (!row.lastAppointmentAt) return '—'
  const status = row.lastAppointmentStatus
    ? APPOINTMENT_STATUS_LABELS_TR[row.lastAppointmentStatus]
    : null
  const dateLabel = shortDate(row.lastAppointmentAt)
  return status ? `${dateLabel} · ${status}` : dateLabel
}

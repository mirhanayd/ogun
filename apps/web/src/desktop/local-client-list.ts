import type { ClientListRow } from '@ogun/db/queries'
import type { DomainEntity, LocalScope } from '@/data/repositories'
import { assignedDietitianForNewClient } from '@/lib/dietitian-assignment'

function text(entity: DomainEntity, key: string): string {
  return typeof entity[key] === 'string' ? String(entity[key]) : ''
}

function instant(entity: DomainEntity, key: string): number {
  const value = new Date(text(entity, key)).getTime()
  return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY
}

export function localCreatedClientProjection(
  input: DomainEntity,
  scope: Pick<LocalScope, 'role' | 'userId' | 'displayName'>,
  now = new Date().toISOString(),
): DomainEntity {
  const assignedDietitianId = assignedDietitianForNewClient(scope.role, scope.userId)
  return {
    ...input,
    status: 'aktif',
    assignedDietitianId,
    assignedDietitianName: assignedDietitianId ? (scope.displayName ?? null) : null,
    createdAt: now,
    updatedAt: now,
  }
}

export function buildLocalClientListRows(
  clients: DomainEntity[],
  measurements: DomainEntity[],
  appointments: DomainEntity[],
): ClientListRow[] {
  return clients.map((client) => {
    const latestMeasurement = measurements
      .filter((row) => row.clientId === client.id)
      .sort((a, b) => instant(b, 'measuredAt') - instant(a, 'measuredAt'))[0]
    const latestAppointment = appointments
      .filter((row) => row.clientId === client.id)
      .sort((a, b) => instant(b, 'startsAt') - instant(a, 'startsAt'))[0]
    const appointmentStatus = latestAppointment?.status
    return {
      id: client.id,
      firstName: text(client, 'firstName'),
      lastName: text(client, 'lastName'),
      birthDate: text(client, 'birthDate') || null,
      status: client.status === 'pasif' || client.status === 'arşiv' ? client.status : 'aktif',
      assignedDietitianId: text(client, 'assignedDietitianId') || null,
      assignedDietitianName: text(client, 'assignedDietitianName') || null,
      lastMeasurementAt: latestMeasurement ? new Date(text(latestMeasurement, 'measuredAt')) : null,
      lastMeasurementWeightKg:
        latestMeasurement?.weightKg == null ? null : String(latestMeasurement.weightKg),
      lastAppointmentAt: latestAppointment ? new Date(text(latestAppointment, 'startsAt')) : null,
      lastAppointmentStatus:
        appointmentStatus === 'planlandı' ||
        appointmentStatus === 'geldi' ||
        appointmentStatus === 'gelmedi' ||
        appointmentStatus === 'iptal' ||
        appointmentStatus === 'ertelendi'
          ? appointmentStatus
          : null,
      createdAt: new Date(text(client, 'createdAt') || 0),
    }
  })
}

import { and, eq, inArray } from 'drizzle-orm'
import { payments } from '../schema/billing'
import { clientHealth } from '../schema/clients'
import { documents, labResults } from '../schema/health-records'
import { clientGoals, measurements } from '../schema/measurements'
import type { Database } from '../client'

export interface DesktopClinicalWorkspace {
  anamneses: (typeof clientHealth.$inferSelect)[]
  measurements: (typeof measurements.$inferSelect)[]
  goals: (typeof clientGoals.$inferSelect)[]
  labResults: (typeof labResults.$inferSelect)[]
  payments: (typeof payments.$inferSelect)[]
  documents: (typeof documents.$inferSelect)[]
}

export async function getDesktopClinicalWorkspace(
  db: Database,
  clinicId: string,
  clientIds: string[],
): Promise<DesktopClinicalWorkspace> {
  if (clientIds.length === 0) {
    return { anamneses: [], measurements: [], goals: [], labResults: [], payments: [], documents: [] }
  }

  const [anamneses, measurementRows, goals, labResultRows, paymentRows, documentRows] = await Promise.all([
    db.select().from(clientHealth).where(inArray(clientHealth.clientId, clientIds)),
    db.select().from(measurements).where(inArray(measurements.clientId, clientIds)),
    db.select().from(clientGoals).where(inArray(clientGoals.clientId, clientIds)),
    db.select().from(labResults).where(inArray(labResults.clientId, clientIds)),
    db
      .select()
      .from(payments)
      .where(and(eq(payments.clinicId, clinicId), inArray(payments.clientId, clientIds))),
    db.select().from(documents).where(inArray(documents.clientId, clientIds)),
  ])

  return {
    anamneses,
    measurements: measurementRows,
    goals,
    labResults: labResultRows,
    payments: paymentRows,
    documents: documentRows,
  }
}

async function findOwnerId(
  db: Database,
  table: typeof measurements | typeof clientGoals | typeof labResults | typeof payments,
  recordId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ clientId: table.clientId })
    .from(table)
    .where(eq(table.id, recordId))
    .limit(1)
  return row?.clientId ?? null
}

export const getMeasurementClientId = (db: Database, id: string) => findOwnerId(db, measurements, id)
export const getGoalClientId = (db: Database, id: string) => findOwnerId(db, clientGoals, id)
export const getLabResultClientId = (db: Database, id: string) => findOwnerId(db, labResults, id)
export const getPaymentClientId = (db: Database, id: string) => findOwnerId(db, payments, id)

import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { payments } from '../schema/billing'
import { clientHealth } from '../schema/clients'
import {
  clientConditions,
  clientMedications,
  conditions,
  medicationProducts,
  medicationProductSubstances,
  medicationSubstances,
} from '../schema/clinical'
import { documents, labResults } from '../schema/health-records'
import { clientGoals, measurements } from '../schema/measurements'
import type { Database } from '../client'
import { withoutCatalogLabels } from './client-clinical'

type DesktopConditionSelection = {
  id: string
  clientId: string
  conditionId: string
  status: string
  diagnosedAt: string | null
  note: string | null
  nameTr: string
  nameEn: string
  sourceCode: string
  isNeoplasm: boolean
  needsReview: boolean
}

type DesktopMedicationSelection = {
  id: string
  clientId: string
  medicationProductId: string | null
  medicationSubstanceId: string | null
  customName: string | null
  dose: string | null
  doseUnit: string | null
  frequency: string | null
  route: string | null
  startedAt: string | null
  endedAt: string | null
  isActive: boolean
  note: string | null
  productName: string | null
  productBarcode: string | null
  substanceName: string | null
  substanceNeedsReview: boolean | null
  productSubstanceNames: string[]
}

export type DesktopAnamnesis = typeof clientHealth.$inferSelect & {
  legacyConditions: string[]
  legacyMedications: string[]
  conditionSelections: DesktopConditionSelection[]
  medicationSelections: DesktopMedicationSelection[]
}

export interface DesktopClinicalWorkspace {
  anamneses: DesktopAnamnesis[]
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

  const [healthRows, selectedConditions, selectedMedications, measurementRows, goals, labResultRows, paymentRows, documentRows] = await Promise.all([
    db.select().from(clientHealth).where(inArray(clientHealth.clientId, clientIds)),
    db
      .select({
        id: clientConditions.id,
        clientId: clientConditions.clientId,
        conditionId: clientConditions.conditionId,
        status: clientConditions.status,
        diagnosedAt: clientConditions.diagnosedAt,
        note: clientConditions.note,
        nameTr: conditions.nameTr,
        nameEn: conditions.nameEn,
        sourceCode: conditions.sourceCode,
        isNeoplasm: conditions.isNeoplasm,
        needsReview: conditions.needsReview,
      })
      .from(clientConditions)
      .innerJoin(conditions, eq(conditions.id, clientConditions.conditionId))
      .where(inArray(clientConditions.clientId, clientIds))
      .orderBy(asc(conditions.nameTr)),
    db
      .select({
        id: clientMedications.id,
        clientId: clientMedications.clientId,
        medicationProductId: clientMedications.medicationProductId,
        medicationSubstanceId: clientMedications.medicationSubstanceId,
        customName: clientMedications.customName,
        dose: clientMedications.dose,
        doseUnit: clientMedications.doseUnit,
        frequency: clientMedications.frequency,
        route: clientMedications.route,
        startedAt: clientMedications.startedAt,
        endedAt: clientMedications.endedAt,
        isActive: clientMedications.isActive,
        note: clientMedications.note,
        productName: medicationProducts.name,
        productBarcode: medicationProducts.barcode,
        substanceName: medicationSubstances.nameTr,
        substanceNeedsReview: medicationSubstances.needsReview,
      })
      .from(clientMedications)
      .leftJoin(medicationProducts, eq(medicationProducts.id, clientMedications.medicationProductId))
      .leftJoin(
        medicationSubstances,
        eq(medicationSubstances.id, clientMedications.medicationSubstanceId),
      )
      .where(inArray(clientMedications.clientId, clientIds))
      .orderBy(desc(clientMedications.isActive)),
    db.select().from(measurements).where(inArray(measurements.clientId, clientIds)),
    db.select().from(clientGoals).where(inArray(clientGoals.clientId, clientIds)),
    db.select().from(labResults).where(inArray(labResults.clientId, clientIds)),
    db
      .select()
      .from(payments)
      .where(and(eq(payments.clinicId, clinicId), inArray(payments.clientId, clientIds))),
    db.select().from(documents).where(inArray(documents.clientId, clientIds)),
  ])

  const productIds = selectedMedications.flatMap((row) =>
    row.medicationProductId ? [row.medicationProductId] : [],
  )
  const productSubstances = productIds.length
    ? await db
        .select({
          medicationProductId: medicationProductSubstances.medicationProductId,
          nameTr: medicationSubstances.nameTr,
        })
        .from(medicationProductSubstances)
        .innerJoin(
          medicationSubstances,
          eq(medicationSubstances.id, medicationProductSubstances.medicationSubstanceId),
        )
        .where(inArray(medicationProductSubstances.medicationProductId, productIds))
        .orderBy(asc(medicationSubstances.nameTr))
    : []

  const productSubstanceNames = new Map<string, string[]>()
  for (const row of productSubstances) {
    const names = productSubstanceNames.get(row.medicationProductId) ?? []
    names.push(row.nameTr)
    productSubstanceNames.set(row.medicationProductId, names)
  }
  const conditionsByClient = new Map<string, DesktopConditionSelection[]>()
  for (const row of selectedConditions) {
    const rows = conditionsByClient.get(row.clientId) ?? []
    rows.push(row)
    conditionsByClient.set(row.clientId, rows)
  }
  const medicationsByClient = new Map<string, DesktopMedicationSelection[]>()
  for (const row of selectedMedications) {
    const rows = medicationsByClient.get(row.clientId) ?? []
    rows.push({
      ...row,
      productSubstanceNames: row.medicationProductId
        ? (productSubstanceNames.get(row.medicationProductId) ?? [])
        : [],
    })
    medicationsByClient.set(row.clientId, rows)
  }
  const anamneses = healthRows.map((health) => {
    const conditionSelections = conditionsByClient.get(health.clientId) ?? []
    const medicationSelections = medicationsByClient.get(health.clientId) ?? []
    return {
      ...health,
      legacyConditions: withoutCatalogLabels(
        health.conditions,
        conditionSelections.map((selection) => selection.nameTr),
      ),
      legacyMedications: withoutCatalogLabels(
        health.medications,
        medicationSelections.flatMap((selection) => {
          const label = selection.productName ?? selection.substanceName
          return label ? [label] : []
        }),
      ),
      conditionSelections,
      medicationSelections: medicationSelections.filter(
        (selection) => selection.medicationProductId || selection.medicationSubstanceId,
      ),
    }
  })

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

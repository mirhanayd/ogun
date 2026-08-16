import { and, desc, eq } from 'drizzle-orm'
import { computeLabAbnormalStatus } from '@ogun/nutrition-core'
import { clients } from '../schema/clients'
import { labResults } from '../schema/health-records'
import type { Database } from '../client'

// Laboratuvar sonuçları (GitHub issue #19 / Prompt 4.3, GÖREV 2) —
// measurements.ts ile AYNI indirekt clinicId-scoping deseni (bkz.
// schema/health-records.ts dosya başı notu).

function toNumericString(value: number | null | undefined): string | null {
  return value === null || value === undefined ? null : value.toString()
}

async function assertClientInClinic(db: Database, clinicId: string, clientId: string): Promise<void> {
  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.clinicId, clinicId)))
    .limit(1)
  if (!client) {
    throw new Error('Danışan bulunamadı.')
  }
}

export interface LabResultInput {
  testedAt: Date
  analyte: string
  value: number
  unit: string
  refMin?: number | null
  refMax?: number | null
  labName?: string | null
  notes?: string | null
  recordedBy: string
}

export async function createLabResult(
  db: Database,
  clinicId: string,
  clientId: string,
  input: LabResultInput,
) {
  await assertClientInClinic(db, clinicId, clientId)
  const [row] = await db
    .insert(labResults)
    .values({
      clientId,
      testedAt: input.testedAt,
      analyte: input.analyte,
      value: input.value.toString(),
      unit: input.unit,
      refMin: toNumericString(input.refMin),
      refMax: toNumericString(input.refMax),
      labName: input.labName || null,
      notes: input.notes || null,
      recordedBy: input.recordedBy,
    })
    .returning()
  if (!row) throw new Error('Laboratuvar sonucu kaydedilemedi.')
  return row
}

// Bir laboratuvar sonucunun GERÇEKTEN bu klinikteki bir danışana ait
// olduğunu doğrular — assertClientInClinic ile AYNI "önce doğrula, sonra
// yaz" deseni (bkz. queries/measurements.ts markGoalAchieved).
async function assertLabResultInClinic(db: Database, clinicId: string, labResultId: string): Promise<void> {
  const [existing] = await db
    .select({ id: labResults.id })
    .from(labResults)
    .innerJoin(clients, eq(clients.id, labResults.clientId))
    .where(and(eq(labResults.id, labResultId), eq(clients.clinicId, clinicId)))
    .limit(1)
  if (!existing) {
    throw new Error('Laboratuvar sonucu bulunamadı.')
  }
}

export async function deleteLabResult(db: Database, clinicId: string, labResultId: string) {
  await assertLabResultInClinic(db, clinicId, labResultId)
  await db.delete(labResults).where(eq(labResults.id, labResultId))
}

export interface LabResultRow {
  id: string
  clientId: string
  testedAt: Date
  analyte: string
  value: number
  unit: string
  refMin: number | null
  refMax: number | null
  // GÖREV 2 — "(hesaplanır)": measurements.ts'teki BKİ ile AYNI kural, kolon
  // DEĞİL, her okumada nutrition-core'un saf fonksiyonuyla türetilir (bkz.
  // schema/health-records.ts labResults üstündeki not).
  isAbnormal: boolean | null
  labName: string | null
  notes: string | null
  recordedBy: string | null
  createdAt: Date
}

function toLabResultRow(row: {
  id: string
  clientId: string
  testedAt: Date
  analyte: string
  value: string
  unit: string
  refMin: string | null
  refMax: string | null
  labName: string | null
  notes: string | null
  recordedBy: string | null
  createdAt: Date
}): LabResultRow {
  const value = Number(row.value)
  const refMin = row.refMin !== null ? Number(row.refMin) : null
  const refMax = row.refMax !== null ? Number(row.refMax) : null
  return {
    id: row.id,
    clientId: row.clientId,
    testedAt: row.testedAt,
    analyte: row.analyte,
    value,
    unit: row.unit,
    refMin,
    refMax,
    isAbnormal: computeLabAbnormalStatus(value, refMin, refMax),
    labName: row.labName,
    notes: row.notes,
    recordedBy: row.recordedBy,
    createdAt: row.createdAt,
  }
}

const LAB_RESULT_COLUMNS = {
  id: labResults.id,
  clientId: labResults.clientId,
  testedAt: labResults.testedAt,
  analyte: labResults.analyte,
  value: labResults.value,
  unit: labResults.unit,
  refMin: labResults.refMin,
  refMax: labResults.refMax,
  labName: labResults.labName,
  notes: labResults.notes,
  recordedBy: labResults.recordedBy,
  createdAt: labResults.createdAt,
} as const

// Zaman serisi grafiği (GÖREV 2) + liste görünümü — en eskiden en yeniye
// (measurements.listMeasurementsForClient ile AYNI sıralama gerekçesi:
// grafik çizimi bu sırayı bekler).
export async function listLabResultsForClient(
  db: Database,
  clinicId: string,
  clientId: string,
): Promise<LabResultRow[]> {
  const rows = await db
    .select(LAB_RESULT_COLUMNS)
    .from(labResults)
    .innerJoin(clients, eq(clients.id, labResults.clientId))
    .where(and(eq(labResults.clientId, clientId), eq(clients.clinicId, clinicId)))
    .orderBy(labResults.testedAt)
  return rows.map(toLabResultRow)
}

// Danışan özet kartındaki "anormal değer" rozeti (GÖREV 2) — her analitin
// EN GÜNCEL sonucu anormalse listelenir (eski, o zamanlar anormal ama artık
// düzelmiş bir değer rozet olarak gösterilmemeli).
export async function listAbnormalLatestLabResults(
  db: Database,
  clinicId: string,
  clientId: string,
): Promise<LabResultRow[]> {
  const rows = await db
    .select(LAB_RESULT_COLUMNS)
    .from(labResults)
    .innerJoin(clients, eq(clients.id, labResults.clientId))
    .where(and(eq(labResults.clientId, clientId), eq(clients.clinicId, clinicId)))
    .orderBy(desc(labResults.testedAt))

  const latestByAnalyte = new Map<string, LabResultRow>()
  for (const row of rows.map(toLabResultRow)) {
    if (!latestByAnalyte.has(row.analyte)) {
      latestByAnalyte.set(row.analyte, row)
    }
  }
  return [...latestByAnalyte.values()].filter((row) => row.isAbnormal === true)
}

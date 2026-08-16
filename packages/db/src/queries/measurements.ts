import { and, desc, eq, gte, isNull } from 'drizzle-orm'
import { clients } from '../schema/clients'
import {
  clientGoals,
  measurements,
  type GoalType,
  type MeasurementSource,
} from '../schema/measurements'
import type { Database } from '../client'

// NOT (ClinicScope ile ilgili, bkz. queries/clients.ts üstündeki benzer not):
// measurements/client_goals'ta doğrudan bir clinicId sütunu YOK (bkz.
// schema/measurements.ts dosya başı notu) — bu yüzden HER sorgu clients ile
// INNER JOIN yaparak clients.clinicId = :clinicId şartını uygular. Bu
// dosyanın TEK çağırıcısı apps/web'de "clinicId'siz sorgu yazılamaz" kuralı
// ClinicScope/withAuth ile tip seviyesinde zorlanır (bkz. authz.ts).

// --- Ölçümler ----------------------------------------------------------------

export interface MeasurementInput {
  measuredAt: Date
  source: MeasurementSource
  weightKg?: number | null
  heightCm?: number | null
  waistCm?: number | null
  hipCm?: number | null
  neckCm?: number | null
  armCm?: number | null
  thighCm?: number | null
  chestCm?: number | null
  bodyFatPct?: number | null
  bodyFatKg?: number | null
  leanMassKg?: number | null
  muscleMassKg?: number | null
  totalBodyWaterL?: number | null
  visceralFatLevel?: number | null
  bmrKcal?: number | null
  phaseAngle?: number | null
  notes?: string | null
  recordedBy: string
}

// numeric sütunlar bu drizzle-orm sürümünde (0.38) mode:'number' DESTEKLEMEZ
// (bkz. schema/measurements.ts dosya başı notu) — bu yüzden Number -> string
// dönüşümü packages/etl'deki importer'larla AYNI desenle burada elle yapılır.
function toNumericString(value: number | null | undefined): string | null {
  return value === null || value === undefined ? null : value.toString()
}

function toMeasurementValues(input: MeasurementInput) {
  return {
    measuredAt: input.measuredAt,
    source: input.source,
    weightKg: toNumericString(input.weightKg),
    heightCm: toNumericString(input.heightCm),
    waistCm: toNumericString(input.waistCm),
    hipCm: toNumericString(input.hipCm),
    neckCm: toNumericString(input.neckCm),
    armCm: toNumericString(input.armCm),
    thighCm: toNumericString(input.thighCm),
    chestCm: toNumericString(input.chestCm),
    bodyFatPct: toNumericString(input.bodyFatPct),
    bodyFatKg: toNumericString(input.bodyFatKg),
    leanMassKg: toNumericString(input.leanMassKg),
    muscleMassKg: toNumericString(input.muscleMassKg),
    totalBodyWaterL: toNumericString(input.totalBodyWaterL),
    visceralFatLevel: input.visceralFatLevel ?? null,
    bmrKcal: input.bmrKcal ?? null,
    phaseAngle: toNumericString(input.phaseAngle),
    notes: input.notes || null,
    recordedBy: input.recordedBy,
  }
}

// clientId'nin GERÇEKTEN bu klinikte kayıtlı olduğunu doğrular (yazma
// işlemlerinden önce) — createClient/getClientById'deki (queries/clients.ts)
// aynı "WHERE clinicId eşleşmezse sessizce bulunamadı" deseni.
async function assertClientInClinic(
  db: Database,
  clinicId: string,
  clientId: string,
): Promise<void> {
  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.clinicId, clinicId)))
    .limit(1)
  if (!client) {
    throw new Error('Danışan bulunamadı.')
  }
}

export async function createMeasurement(
  db: Database,
  clinicId: string,
  clientId: string,
  input: MeasurementInput,
) {
  await assertClientInClinic(db, clinicId, clientId)
  const [measurement] = await db
    .insert(measurements)
    .values({ clientId, ...toMeasurementValues(input) })
    .returning()
  if (!measurement) throw new Error('Ölçüm kaydedilemedi.')
  return measurement
}

// Grafikler + trend hesapları (GÖREV 3, GÖREV 4) için bir danışanın ölçüm
// geçmişi — en eskiden en yeniye (zaman serisi çizimi bu sırayı bekler).
// `since` verilirse zaman aralığı seçicisi (1 ay/3 ay/6 ay) için filtre uygular.
export async function listMeasurementsForClient(
  db: Database,
  clinicId: string,
  clientId: string,
  options: { since?: Date } = {},
) {
  const conditions = [eq(measurements.clientId, clientId), eq(clients.clinicId, clinicId)]
  if (options.since) {
    conditions.push(gte(measurements.measuredAt, options.since))
  }
  return db
    .select({
      id: measurements.id,
      clientId: measurements.clientId,
      measuredAt: measurements.measuredAt,
      source: measurements.source,
      weightKg: measurements.weightKg,
      heightCm: measurements.heightCm,
      waistCm: measurements.waistCm,
      hipCm: measurements.hipCm,
      neckCm: measurements.neckCm,
      armCm: measurements.armCm,
      thighCm: measurements.thighCm,
      chestCm: measurements.chestCm,
      bodyFatPct: measurements.bodyFatPct,
      bodyFatKg: measurements.bodyFatKg,
      leanMassKg: measurements.leanMassKg,
      muscleMassKg: measurements.muscleMassKg,
      totalBodyWaterL: measurements.totalBodyWaterL,
      visceralFatLevel: measurements.visceralFatLevel,
      bmrKcal: measurements.bmrKcal,
      phaseAngle: measurements.phaseAngle,
      notes: measurements.notes,
      recordedBy: measurements.recordedBy,
      createdAt: measurements.createdAt,
    })
    .from(measurements)
    .innerJoin(clients, eq(clients.id, measurements.clientId))
    .where(and(...conditions))
    .orderBy(measurements.measuredAt)
}

// "Önceki ölçüme göre fark" (GÖREV 2 — girerken anlık gösterge) ve danışan
// özet kartındaki "Güncel kilo/BKİ" (bkz. app/(app)/danisanlar/[id]/page.tsx
// SummaryStat alanları) için tek bir en güncel ölçüm.
export async function getLatestMeasurement(db: Database, clinicId: string, clientId: string) {
  const [measurement] = await db
    .select({
      id: measurements.id,
      clientId: measurements.clientId,
      measuredAt: measurements.measuredAt,
      source: measurements.source,
      weightKg: measurements.weightKg,
      heightCm: measurements.heightCm,
      waistCm: measurements.waistCm,
      hipCm: measurements.hipCm,
      neckCm: measurements.neckCm,
      armCm: measurements.armCm,
      thighCm: measurements.thighCm,
      chestCm: measurements.chestCm,
      bodyFatPct: measurements.bodyFatPct,
      bodyFatKg: measurements.bodyFatKg,
      leanMassKg: measurements.leanMassKg,
      muscleMassKg: measurements.muscleMassKg,
      totalBodyWaterL: measurements.totalBodyWaterL,
      visceralFatLevel: measurements.visceralFatLevel,
      bmrKcal: measurements.bmrKcal,
      phaseAngle: measurements.phaseAngle,
      notes: measurements.notes,
      recordedBy: measurements.recordedBy,
      createdAt: measurements.createdAt,
    })
    .from(measurements)
    .innerJoin(clients, eq(clients.id, measurements.clientId))
    .where(and(eq(measurements.clientId, clientId), eq(clients.clinicId, clinicId)))
    .orderBy(desc(measurements.measuredAt))
    .limit(1)
  return measurement ?? null
}

// --- Hedefler ------------------------------------------------------------

export interface GoalInput {
  type: GoalType
  targetValue: number
  targetDate?: string | null // 'YYYY-MM-DD'
  startValue: number
  startedAt?: Date
}

export async function createGoal(
  db: Database,
  clinicId: string,
  clientId: string,
  input: GoalInput,
) {
  await assertClientInClinic(db, clinicId, clientId)
  const [goal] = await db
    .insert(clientGoals)
    .values({
      clientId,
      type: input.type,
      targetValue: input.targetValue.toString(),
      targetDate: input.targetDate ?? null,
      startValue: input.startValue.toString(),
      startedAt: input.startedAt ?? new Date(),
    })
    .returning()
  if (!goal) throw new Error('Hedef kaydedilemedi.')
  return goal
}

// Bir danışanın belirli bir tip için AKTİF (achievedAt IS NULL) hedefi —
// birden fazlaysa en yeni başlanan (bkz. schema/measurements.ts dosya başı
// notu: uniqueness kısıtı yok, "aktif" tanımı sorgu katmanında).
export async function getActiveGoal(
  db: Database,
  clinicId: string,
  clientId: string,
  type: GoalType,
) {
  const [goal] = await db
    .select({
      id: clientGoals.id,
      clientId: clientGoals.clientId,
      type: clientGoals.type,
      targetValue: clientGoals.targetValue,
      targetDate: clientGoals.targetDate,
      startValue: clientGoals.startValue,
      startedAt: clientGoals.startedAt,
      achievedAt: clientGoals.achievedAt,
    })
    .from(clientGoals)
    .innerJoin(clients, eq(clients.id, clientGoals.clientId))
    .where(
      and(
        eq(clientGoals.clientId, clientId),
        eq(clients.clinicId, clinicId),
        eq(clientGoals.type, type),
        isNull(clientGoals.achievedAt),
      ),
    )
    .orderBy(desc(clientGoals.startedAt))
    .limit(1)
  return goal ?? null
}

export async function listGoalsForClient(db: Database, clinicId: string, clientId: string) {
  return db
    .select({
      id: clientGoals.id,
      clientId: clientGoals.clientId,
      type: clientGoals.type,
      targetValue: clientGoals.targetValue,
      targetDate: clientGoals.targetDate,
      startValue: clientGoals.startValue,
      startedAt: clientGoals.startedAt,
      achievedAt: clientGoals.achievedAt,
    })
    .from(clientGoals)
    .innerJoin(clients, eq(clients.id, clientGoals.clientId))
    .where(and(eq(clientGoals.clientId, clientId), eq(clients.clinicId, clinicId)))
    .orderBy(desc(clientGoals.startedAt))
}

// UPDATE ... FROM (join'li güncelleme) yerine BİLEREK iki adımlı: önce
// hedefin GERÇEKTEN bu klinikteki bir danışana ait olduğunu doğrula, sonra
// id'ye göre güncelle — assertClientInClinic ile AYNI "önce doğrula, sonra
// yaz" deseni, drizzle-orm'un update().from() söz dizimine bağımlı kalmadan.
export async function markGoalAchieved(db: Database, clinicId: string, goalId: string) {
  const [existing] = await db
    .select({ id: clientGoals.id })
    .from(clientGoals)
    .innerJoin(clients, eq(clients.id, clientGoals.clientId))
    .where(and(eq(clientGoals.id, goalId), eq(clients.clinicId, clinicId)))
    .limit(1)
  if (!existing) return null

  const [goal] = await db
    .update(clientGoals)
    .set({ achievedAt: new Date() })
    .where(eq(clientGoals.id, goalId))
    .returning()
  return goal ?? null
}

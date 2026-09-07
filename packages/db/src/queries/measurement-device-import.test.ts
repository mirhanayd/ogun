import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { eq, inArray, sql } from 'drizzle-orm'
import type { Database } from '../client'
import { clinics, users } from '../schema/tenancy'
import { clients } from '../schema/clients'
import { measurements } from '../schema/measurements'
import {
  measurementDeviceImportSchema,
  tanitaMeasurementSchema,
  tanitaFingerprintInput,
} from '../domain/measurement-device-import'
import { createMeasurement, listMeasurementsForClient } from './measurements'

const normalizedPayload = tanitaMeasurementSchema.parse({
  deviceModel: 'BC-601',
  date: '2026-08-24',
  time: '13:58:41',
  sourceTimestamp: '2026-08-24T13:58:41+03:00',
  measuredAt: '2026-08-24T10:58:41.000Z',
  timeZone: 'Europe/Istanbul',
  ageReferenceYears: 41,
  heightCm: 169,
  weightKg: 86.6,
  importedBmi: 30.3,
  bodyFatPct: 44.2,
  muscleMassKg: 45.9,
  boneMassKg: 2.5,
  visceralFatLevel: 9,
  metabolicAgeYears: 56,
  dailyCalorieIntakeKcal: 2349,
  bodyWaterPct: 41.6,
  importedBmrKcal: null,
  bodyFatKg: null,
  leanMassKg: null,
  segmentalFat: {
    rightArmPct: 44.7,
    leftArmPct: 45,
    rightLegPct: 44.7,
    leftLegPct: 44.4,
    trunkPct: 43.8,
  },
  segmentalMuscle: {
    rightArmKg: 2.3,
    leftArmKg: 2.4,
    rightLegKg: 7.8,
    leftLegKg: 7.8,
    trunkKg: 25.6,
  },
  unknownRawValues: { CS: 'E0' },
  deviceStatus: 'E0',
})
const deviceImport = measurementDeviceImportSchema.parse({
  source: 'tanita',
  deviceModel: 'BC-601',
  parserVersion: 'tanita-bc601/1',
  sourceFormat: 'csv',
  sourceTimestamp: normalizedPayload.sourceTimestamp,
  rawHash: 'a'.repeat(64),
  fingerprint: createHash('sha256').update(tanitaFingerprintInput(normalizedPayload)).digest('hex'),
  normalizedPayload,
})
const withDb = process.env.DATABASE_URL ? describe : describe.skip
withDb('Tanita device JSON migration and scoped persistence', () => {
  let db: Database
  const userId = randomUUID(),
    clinicId = randomUUID(),
    anotherClinic = randomUUID(),
    clientId = randomUUID(),
    secondClient = randomUUID()
  const input = {
    measuredAt: new Date(normalizedPayload.measuredAt),
    source: 'tanita' as const,
    recordedBy: userId,
    weightKg: 86.6,
    heightCm: 169,
    bodyFatPct: 44.2,
    muscleMassKg: 45.9,
    visceralFatLevel: 9,
    deviceImport,
  }
  beforeAll(async () => {
    ;({ db } = await import('../client'))
    await db.insert(users).values({ id: userId, name: 'Tanita test', email: `${userId}@ogun.test` })
    await db.insert(clinics).values([
      { id: clinicId, name: 'Tanita A', slug: clinicId },
      { id: anotherClinic, name: 'Tanita B', slug: anotherClinic },
    ])
    await db.insert(clients).values([
      { id: clientId, clinicId, firstName: 'Fixture', lastName: 'A' },
      { id: secondClient, clinicId, firstName: 'Fixture', lastName: 'B' },
    ])
  })
  afterAll(async () => {
    await db.delete(measurements).where(inArray(measurements.clientId, [clientId, secondClient]))
    await db.delete(clients).where(inArray(clients.id, [clientId, secondClient]))
    await db.delete(clinics).where(inArray(clinics.id, [clinicId, anotherClinic]))
    await db.delete(users).where(eq(users.id, userId))
  })
  it('keeps a pre-extension row intact when applying the actual migration', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(
        sql.raw(
          'CREATE TEMP TABLE measurements (id text PRIMARY KEY, client_id text NOT NULL, weight_kg numeric) ON COMMIT DROP',
        ),
      )
      await tx.execute(sql.raw('SET LOCAL search_path TO pg_temp'))
      await tx.execute(sql.raw("INSERT INTO measurements VALUES ('old', 'client', 77.2)"))
      const migration = readFileSync(
        new URL('../../drizzle/0030_late_expediter.sql', import.meta.url),
        'utf8',
      )
      for (const statement of migration.split('--> statement-breakpoint'))
        await tx.execute(sql.raw(statement))
      const rows = await tx.execute(
        sql.raw("SELECT weight_kg, device_import FROM measurements WHERE id='old'"),
      )
      expect(Number(rows[0]?.weight_kg)).toBe(77.2)
      expect(rows[0]?.device_import).toBeNull()
    })
  })
  it('round trips provenance and segments without polluting BMR or water liters', async () => {
    await createMeasurement(db, clinicId, clientId, input)
    const [row] = await listMeasurementsForClient(db, clinicId, clientId)
    expect(row?.deviceImport).toEqual(deviceImport)
    expect(row?.bmrKcal).toBeNull()
    expect(row?.totalBodyWaterL).toBeNull()
    expect(await listMeasurementsForClient(db, anotherClinic, clientId)).toEqual([])
    await expect(createMeasurement(db, anotherClinic, clientId, input)).rejects.toThrow(
      'Danışan bulunamadı',
    )
  })
  it('rejects duplicates atomically and allows the same source for a different client', async () => {
    await expect(createMeasurement(db, clinicId, clientId, input)).rejects.toThrow(
      'Bu Tanita ölçümü daha önce içe aktarılmış.',
    )
    const results = await Promise.allSettled([
      createMeasurement(db, clinicId, secondClient, input),
      createMeasurement(db, clinicId, secondClient, input),
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(await listMeasurementsForClient(db, clinicId, secondClient)).toHaveLength(1)
  })
  it('validates source provenance instead of trusting renderer-supplied JSON', async () => {
    await expect(
      createMeasurement(db, clinicId, clientId, {
        ...input,
        deviceImport: { ...deviceImport, fingerprint: 'b'.repeat(64) },
      }),
    ).rejects.toThrow('doğrulanamadı')
    await expect(
      createMeasurement(db, clinicId, clientId, { ...input, source: 'manuel' }),
    ).rejects.toThrow('doğrulanamadı')
  })
})

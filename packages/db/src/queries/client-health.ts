import { and, eq } from 'drizzle-orm'
import { clientHealth, clients, type ActivityLevelValue, type ClientAllergenEntry } from '../schema/clients'
import { normalizeSearchText } from '../lib/normalize'
import type { Database } from '../client'

// Anamnez formu okuma/yazma (GitHub issue #19 / Prompt 4.3, GÖREV 1).
// clients.ts'teki clientHealth/measurements.ts'teki AYNI desen: clinicId
// doğrudan bir sütun değil, clientId üzerinden clients'a JOIN edilerek
// doğrulanır (bkz. schema/health-records.ts dosya başı notu).

export interface ClientHealthAllergenInput {
  id: string
  label: string
  severity: 'hafif' | 'orta' | 'şiddetli' | null
  note: string | null
}

// export EDİLİYOR — normalizasyon/şekillendirme mantığının (label trim,
// boşları filtrele, normalizeSearchText ile normalized üret) bağımsız
// test edilebilmesi için (bkz. client-health.test.ts). Bu, isAbnormal
// hesabının nutrition-core'da AYRI test edildiği desenle AYNI mantık.
export function toAllergenEntries(input: ClientHealthAllergenInput[]): ClientAllergenEntry[] {
  return input
    .map((entry) => ({ ...entry, label: entry.label.trim() }))
    .filter((entry) => entry.label.length > 0)
    .map((entry) => ({
      id: entry.id,
      label: entry.label,
      // Plan editörünün (gelecekteki issue) foods.searchText'e karşı basit
      // içerme kontrolü yapabilmesi için önceden hesaplanmış normalize
      // metin — bkz. schema/clients.ts ClientAllergenEntry üstündeki not.
      normalized: normalizeSearchText(entry.label),
      severity: entry.severity,
      note: entry.note,
    }))
}

export interface ClientHealthInput {
  conditions: string[]
  medications: string[]
  allergies: ClientHealthAllergenInput[]
  intolerances: ClientHealthAllergenInput[]
  surgeries: string | null
  familyHistory: string | null
  smokingStatus: string | null
  alcoholUse: string | null
  mealsPerDay: number | null
  eatingOutFrequency: string | null
  waterIntakeMl: number | null
  activityLevel: ActivityLevelValue | null
  activityNotes: string | null
  sleepHours: number | null
  sleepQuality: string | null
  bowelHabits: string | null
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

export async function getClientHealth(db: Database, clinicId: string, clientId: string) {
  const [row] = await db
    .select({
      id: clientHealth.id,
      clientId: clientHealth.clientId,
      conditions: clientHealth.conditions,
      medications: clientHealth.medications,
      allergies: clientHealth.allergies,
      intolerances: clientHealth.intolerances,
      surgeries: clientHealth.surgeries,
      familyHistory: clientHealth.familyHistory,
      smokingStatus: clientHealth.smokingStatus,
      alcoholUse: clientHealth.alcoholUse,
      mealsPerDay: clientHealth.mealsPerDay,
      eatingOutFrequency: clientHealth.eatingOutFrequency,
      waterIntakeMl: clientHealth.waterIntakeMl,
      activityLevel: clientHealth.activityLevel,
      activityNotes: clientHealth.activityNotes,
      sleepHours: clientHealth.sleepHours,
      sleepQuality: clientHealth.sleepQuality,
      bowelHabits: clientHealth.bowelHabits,
      updatedAt: clientHealth.updatedAt,
    })
    .from(clientHealth)
    .innerJoin(clients, eq(clients.id, clientHealth.clientId))
    .where(and(eq(clientHealth.clientId, clientId), eq(clients.clinicId, clinicId)))
    .limit(1)
  return row ?? null
}

// Otomatik kaydet (GÖREV 1 — 800ms debounce) her tetiklendiğinde TÜM formu
// gönderir — bu yüzden burada "kısmi güncelleme" yok, insert-veya-tam-
// güncelleme (upsert) yeterli. client_health_client_id_idx unique indeksi
// (schema/clients.ts) bunun çakışma hedefi.
export async function upsertClientHealth(
  db: Database,
  clinicId: string,
  clientId: string,
  input: ClientHealthInput,
) {
  await assertClientInClinic(db, clinicId, clientId)

  const values = {
    clientId,
    conditions: input.conditions,
    medications: input.medications,
    allergies: toAllergenEntries(input.allergies),
    intolerances: toAllergenEntries(input.intolerances),
    surgeries: input.surgeries,
    familyHistory: input.familyHistory,
    smokingStatus: input.smokingStatus,
    alcoholUse: input.alcoholUse,
    mealsPerDay: input.mealsPerDay,
    eatingOutFrequency: input.eatingOutFrequency,
    waterIntakeMl: input.waterIntakeMl,
    activityLevel: input.activityLevel,
    activityNotes: input.activityNotes,
    sleepHours: input.sleepHours,
    sleepQuality: input.sleepQuality,
    bowelHabits: input.bowelHabits,
  }

  const [row] = await db
    .insert(clientHealth)
    .values(values)
    .onConflictDoUpdate({ target: clientHealth.clientId, set: values })
    .returning()
  if (!row) throw new Error('Anamnez kaydedilemedi.')
  return row
}

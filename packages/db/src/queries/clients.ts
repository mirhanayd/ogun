import { and, count, desc, eq, ilike, inArray, isNotNull, isNull, lte, or } from 'drizzle-orm'
import type { SQLWrapper } from 'drizzle-orm'
import { clients, type ClientSex, type ClientStatus } from '../schema/clients'
import { users } from '../schema/tenancy'
import type { Database } from '../client'

// NOT (ClinicScope ile ilgili, bkz. queries/clinics.ts üstündeki benzer not):
// bu sorgular clinicId'yi düz bir string olarak alır — "danışan verisine
// dokunan sorgu clinicId'siz yazılamasın" kuralı, bu dosyanın TEK çağırıcısı
// olan apps/web tarafında (authz.ts ClinicScope/withAuth) tip seviyesinde
// zorlanır. packages/db bu markalı tipten habersizdir (kasıtlı olarak —
// bkz. authz.ts dosya başı açıklaması).

const HARD_DELETE_GRACE_PERIOD_DAYS = 30

export async function getClientById(db: Database, clinicId: string, clientId: string) {
  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.clinicId, clinicId)))
    .limit(1)
  return client ?? null
}

export interface ClientConsentInput {
  kvkkConsentAt: Date
  kvkkConsentVersion: string
  explicitConsentAt: Date
  marketingConsentAt?: Date | null
}

// GitHub issue #12 / Prompt 3.3 tarafından çağrılacak şekilde tasarlanmıştı,
// GitHub issue #17 / Prompt 4.1'in createClient'ı bu fonksiyonu TEKRARLAMAZ —
// rıza alanları artık doğrudan createClient'ın insert'inde set ediliyor.
// Bu fonksiyon, kaydı OLUŞTURDUKTAN SONRA rızanın ayrıca güncellenmesi/
// yenilenmesi gereken senaryolar için (ör. aydınlatma metni yeni bir sürüme
// geçtiğinde danışandan yeniden onay istenmesi) hâlâ geçerli.
export async function recordClientConsent(
  db: Database,
  clinicId: string,
  clientId: string,
  consent: ClientConsentInput,
) {
  const [client] = await db
    .update(clients)
    .set({
      kvkkConsentAt: consent.kvkkConsentAt,
      kvkkConsentVersion: consent.kvkkConsentVersion,
      explicitConsentAt: consent.explicitConsentAt,
      marketingConsentAt: consent.marketingConsentAt ?? null,
    })
    .where(and(eq(clients.id, clientId), eq(clients.clinicId, clinicId)))
    .returning()
  return client ?? null
}

// --- Danışan listesi (GitHub #17 / Prompt 4.1, GÖREV 2) --------------------

export interface ListClientsInput {
  page?: number
  pageSize?: number
  // Ad/soyad/telefon/e-posta üzerinde basit bir ILIKE araması. foods.searchText
  // gibi önceden hesaplanmış bir normalize edilmiş arama sütunu BİLEREK
  // kurulmadı — klinik başına danışan sayısı (yüzler/binler mertebesi),
  // foods tablosundaki (15.000+ satır, çok dilli) ölçekle kıyaslanamayacak
  // kadar küçük; basit ILIKE bu ölçekte yeterli.
  search?: string
  status?: ClientStatus
  assignedDietitianId?: string
}

export interface ClientListRow {
  id: string
  firstName: string
  lastName: string
  birthDate: string | null
  status: ClientStatus
  assignedDietitianId: string | null
  assignedDietitianName: string | null
  createdAt: Date
}

export interface ListClientsResult {
  rows: ClientListRow[]
  total: number
  page: number
  pageSize: number
}

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100

function buildClientListFilters(clinicId: string, input: ListClientsInput): (SQLWrapper | undefined)[] {
  const search = input.search?.trim()
  return [
    eq(clients.clinicId, clinicId),
    // Soft-delete edilmiş (silme talebi işlenmiş) danışanlar listede
    // GÖRÜNMEZ — bkz. softDeleteClient. "arşiv" (status) ile "silinmiş"
    // (deletedAt) BİLEREK farklı kavramlar: arşiv, diyetisyenin geri
    // dönebileceği bir durum; silme, KVKK veri sahibi hakkının sonucu.
    isNull(clients.deletedAt),
    input.status ? eq(clients.status, input.status) : undefined,
    input.assignedDietitianId ? eq(clients.assignedDietitianId, input.assignedDietitianId) : undefined,
    search
      ? or(
          ilike(clients.firstName, `%${search}%`),
          ilike(clients.lastName, `%${search}%`),
          ilike(clients.phone, `%${search}%`),
          ilike(clients.email, `%${search}%`),
        )
      : undefined,
  ]
}

// Sunucu tarafı sayfalama + arama + filtre (GÖREV 2). "Son ölçüm"/"son
// randevu" kolonları BİLEREK burada YOK — measurements (GitHub issue #18 /
// Prompt 4.2) ve randevu modülü (henüz açılmamış, gelecekteki bir issue)
// tabloları bu repoda henüz yok. UI katmanı (clients-table.tsx) bu iki
// kolonu "—" ile gösterir; bu tablolar gelince buraya birer LEFT JOIN
// LATERAL (bkz. foods.ts getFoodSummaries'teki aynı desen) eklenip
// ListClientsResult genişletilecek.
export async function listClients(db: Database, clinicId: string, input: ListClientsInput = {}): Promise<ListClientsResult> {
  const page = Math.max(input.page ?? 1, 1)
  const pageSize = Math.min(Math.max(input.pageSize ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE)
  const whereClause = and(...buildClientListFilters(clinicId, input))

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: clients.id,
        firstName: clients.firstName,
        lastName: clients.lastName,
        birthDate: clients.birthDate,
        status: clients.status,
        assignedDietitianId: clients.assignedDietitianId,
        assignedDietitianName: users.name,
        createdAt: clients.createdAt,
      })
      .from(clients)
      .leftJoin(users, eq(users.id, clients.assignedDietitianId))
      .where(whereClause)
      .orderBy(desc(clients.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(clients).where(whereClause),
  ])

  return { rows, total: totalRows[0]?.total ?? 0, page, pageSize }
}

// --- Yeni danışan formu (GÖREV 3) -------------------------------------------

export interface CreateClientInput {
  firstName: string
  lastName: string
  phone?: string | null
  birthDate?: string | null // 'YYYY-MM-DD'
  sex?: ClientSex | null
  // Rıza alanları — çağıran taraf (apps/web/src/app/(app)/danisanlar/actions.ts
  // createClientAction) assertClientConsentComplete()'i ÇAĞIRDIKTAN SONRA
  // buraya geçirir (bkz. apps/web/src/lib/validation/client-schemas.ts).
  // Bu fonksiyon rızayı KENDİSİ doğrulamaz — o invaryant kontrolü bilerek
  // tek bir yerde (client-schemas.ts) toplanıyor, sorgu katmanı sadece yazar.
  kvkkConsentAt: Date
  kvkkConsentVersion: string
  explicitConsentAt: Date
  marketingConsentAt?: Date | null
}

export async function createClient(db: Database, clinicId: string, input: CreateClientInput) {
  const [client] = await db
    .insert(clients)
    .values({
      clinicId,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone ?? null,
      birthDate: input.birthDate ?? null,
      sex: input.sex ?? null,
      kvkkConsentAt: input.kvkkConsentAt,
      kvkkConsentVersion: input.kvkkConsentVersion,
      explicitConsentAt: input.explicitConsentAt,
      marketingConsentAt: input.marketingConsentAt ?? null,
    })
    .returning()
  if (!client) throw new Error('Danışan oluşturulamadı.')
  return client
}

// --- Danışan detay / "Genel" sekmesi düzenleme (GÖREV 4) --------------------

export interface UpdateClientGeneralInput {
  firstName: string
  lastName: string
  birthDate?: string | null
  sex?: ClientSex | null
  phone?: string | null
  email?: string | null
  occupation?: string | null
  referralSource?: string | null
  notes?: string | null
  status: ClientStatus
}

export async function updateClientGeneralInfo(
  db: Database,
  clinicId: string,
  clientId: string,
  input: UpdateClientGeneralInput,
) {
  const [client] = await db
    .update(clients)
    .set({
      firstName: input.firstName,
      lastName: input.lastName,
      birthDate: input.birthDate ?? null,
      sex: input.sex ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      occupation: input.occupation ?? null,
      referralSource: input.referralSource ?? null,
      notes: input.notes ?? null,
      status: input.status,
    })
    .where(and(eq(clients.id, clientId), eq(clients.clinicId, clinicId)))
    .returning()
  return client ?? null
}

// --- Toplu işlemler (GÖREV 2 — "Toplu işlem: arşivle, diyetisyen ata") -----

// Aynı klinikteki danışanlardan, geçerli olan id'leri arşivler (status='arşiv').
// Başka bir kliniğe ait id'ler WHERE clinicId eşleşmediği için sessizce
// atlanır — bkz. authz.ts ClinicScope, bu davranış "başka kliniğin verisine
// yanlışlıkla sızma" değil "başka kliniğin verisi bu sorgunun kapsamı DIŞI"
// anlamına gelir.
export async function archiveClients(db: Database, clinicId: string, clientIds: string[]) {
  if (clientIds.length === 0) return []
  return db
    .update(clients)
    .set({ status: 'arşiv' })
    .where(and(eq(clients.clinicId, clinicId), inArray(clients.id, clientIds)))
    .returning({ id: clients.id })
}

// Bir grup danışana aynı diyetisyeni atar. dietitianId'nin GERÇEKTEN bu
// klinikte (owner/dietitian rolüyle) üye olduğunun doğrulanması BİLEREK
// burada YAPILMAZ — bkz. schema/clients.ts assignedDietitianId üstündeki not.
// Çağıran taraf (apps/web/src/app/(app)/danisanlar/actions.ts
// assignDietitianAction) dietitianId'yi listClinicDietitians() sonucundan
// gelen bir seçenek listesine karşı doğrular.
export async function assignDietitianToClients(
  db: Database,
  clinicId: string,
  clientIds: string[],
  dietitianId: string,
) {
  if (clientIds.length === 0) return []
  return db
    .update(clients)
    .set({ assignedDietitianId: dietitianId })
    .where(and(eq(clients.clinicId, clinicId), inArray(clients.id, clientIds)))
    .returning({ id: clients.id })
}

// Danışan kaydını yumuşak siler (soft delete) VE 30 gün sonrası için kalıcı
// silme kuyruğuna alır. Gerçek kalıcı silme işlemini tetikleyecek bir
// cron/worker bu repoda HENÜZ YOK — bkz. findClientsPastDeletionGracePeriod
// üstündeki not.
export async function softDeleteClient(db: Database, clinicId: string, clientId: string) {
  const now = new Date()
  const scheduledForDeletionAt = new Date(now.getTime() + HARD_DELETE_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000)
  const [client] = await db
    .update(clients)
    .set({ deletedAt: now, scheduledForDeletionAt })
    .where(and(eq(clients.id, clientId), eq(clients.clinicId, clinicId)))
    .returning()
  return client ?? null
}

// 30 günlük bekleme süresini geçmiş, kalıcı silmeye hazır kayıtlar.
//
// ÖNEMLİ: bu fonksiyonu periyodik olarak çağırıp sonucunu gerçekten kalıcı
// DELETE'e çeviren bir zamanlayıcı (cron/worker/queue — ör. pg-boss, BullMQ)
// bu repoda HENÜZ KURULU DEĞİL (docker-compose.yml'de sadece Postgres var).
// Bunu sıfırdan kurmak bu issue'nun kapsamı DIŞINDA bırakıldı — burası sadece
// "kimin silineceğini bulma" sorgusu. Bağlamak ileride ayrı bir altyapı
// issue'sunun işi.
export async function findClientsPastDeletionGracePeriod(db: Database, asOf: Date = new Date()) {
  return db
    .select()
    .from(clients)
    .where(and(isNotNull(clients.scheduledForDeletionAt), lte(clients.scheduledForDeletionAt, asOf)))
}

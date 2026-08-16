import { and, eq, isNotNull, lte } from 'drizzle-orm'
import { clients } from '../schema'
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

// Gelecekteki danışan oluşturma/rıza akışı (Prompt 4.1) tarafından
// çağrılacak — bkz. apps/web/src/lib/validation/client-schemas.ts
// (assertClientConsentComplete), rıza TAMAMLANMADAN bir danışan kaydı
// "aktif" sayılamaz kuralının doğrulayıcısı orada, veritabanı yazımı burada.
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

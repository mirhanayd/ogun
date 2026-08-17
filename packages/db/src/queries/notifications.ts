// Panel (dashboard) bildirim akışı için ham sorgular — GitHub issue #41 /
// Prompt 7.3, GÖREV 4: "Bugünün randevuları, gelmeyen danışanlar, 2 haftadır
// ölçüm girmemiş danışanlar, süresi dolan paketler". finance-aggregation.ts
// / client-package.ts (GitHub #40) ile AYNI iş bölümü: bu dosya SADECE ham
// satırları getirir, hangi eşiğin ("2 hafta", "7 gün kala") "bildirim
// gerektirir" sayıldığına dair SAF karar mantığı apps/web/src/lib/
// notifications/summary.ts'te (DB'siz test edilebilir, bkz. summary.test.ts).
import { and, desc, eq, gte, isNull, lte, max } from 'drizzle-orm'
import { billingPackages, clientPackages, type ClientPackageStatus } from '../schema/billing'
import { clients } from '../schema/clients'
import { measurements } from '../schema/measurements'
import type { Database } from '../client'

// --- Gelmeyen (no-show) danışanlar ------------------------------------------
//
// appointments.ts'te appointmentListSelection zaten var ama clientId/isim
// dışındaki alanları (dietitianName JOIN'i vb.) bu bildirim kartı İÇİN
// GEREKSİZ — bu yüzden burada AYRI, dar bir seçim kullanılıyor (appointments
// tablosuna doğrudan erişim, appointments.ts'i BURADAN import etmek yerine —
// döngüsel bağımlılık YOK ama bu sorgunun ihtiyacı appointments.ts'in genel
// amaçlı "liste" fonksiyonlarından farklı, bkz. aşağıdaki import).
import { appointments } from '../schema/appointments'

export interface NoShowAppointmentRow {
  appointmentId: string
  clientId: string
  clientFirstName: string
  clientLastName: string
  startsAt: Date
}

// `since` — no-show taraması için geriye dönük pencere (bkz. summary.ts
// NO_SHOW_LOOKBACK_DAYS); randevu modülünün kendisi (appointments.ts) bir
// varsayılan dayatmaz, o karar burada DEĞİL çağıran tarafta.
export async function listRecentNoShowAppointments(
  db: Database,
  clinicId: string,
  since: Date,
): Promise<NoShowAppointmentRow[]> {
  return db
    .select({
      appointmentId: appointments.id,
      clientId: appointments.clientId,
      clientFirstName: clients.firstName,
      clientLastName: clients.lastName,
      startsAt: appointments.startsAt,
    })
    .from(appointments)
    .innerJoin(clients, eq(clients.id, appointments.clientId))
    .where(and(eq(appointments.clinicId, clinicId), eq(appointments.status, 'gelmedi'), gte(appointments.startsAt, since)))
    .orderBy(desc(appointments.startsAt))
}

// --- Ölçüm girilmemiş danışanlar ---------------------------------------------

export interface ClientMeasurementRecencyRow {
  clientId: string
  firstName: string
  lastName: string
  createdAt: Date
  lastMeasuredAt: Date | null
}

// Sadece 'aktif' (pasif/arşiv danışanlar diyetisyenin aktif takibinde
// SAYILMAZ, bkz. schema/clients.ts clientStatusEnum) VE soft-delete
// edilmemiş danışanlar. lastMeasuredAt NULL = hiç ölçüm girilmemiş — "2
// haftadır girilmemiş" eşiğinin hiç ölçümü olmayan (ama uzun süredir kayıtlı)
// danışanları da kapsaması İÇİN createdAt de dönüyor (bkz. summary.ts
// isStaleMeasurementClient, "yeni kayıt olan danışanı hemen uyarma" kuralı).
export async function listActiveClientsWithLastMeasurement(
  db: Database,
  clinicId: string,
): Promise<ClientMeasurementRecencyRow[]> {
  const lastMeasurements = db
    .select({
      clientId: measurements.clientId,
      lastMeasuredAt: max(measurements.measuredAt).as('last_measured_at'),
    })
    .from(measurements)
    .groupBy(measurements.clientId)
    .as('last_measurements')

  return db
    .select({
      clientId: clients.id,
      firstName: clients.firstName,
      lastName: clients.lastName,
      createdAt: clients.createdAt,
      lastMeasuredAt: lastMeasurements.lastMeasuredAt,
    })
    .from(clients)
    .leftJoin(lastMeasurements, eq(lastMeasurements.clientId, clients.id))
    .where(and(eq(clients.clinicId, clinicId), isNull(clients.deletedAt), eq(clients.status, 'aktif')))
}

// --- Süresi yaklaşan/dolan paketler ------------------------------------------

export interface ExpiringPackageRow {
  clientPackageId: string
  clientId: string
  clientFirstName: string
  clientLastName: string
  packageName: string
  expiresAt: Date
  status: ClientPackageStatus
}

// `until` — "kaç gün kala uyar" eşiği ÇAĞIRAN tarafından verilir (bkz.
// summary.ts PACKAGE_EXPIRY_WARNING_DAYS); zaten geçmiş (expiresAt < now)
// ama status hâlâ 'aktif' olan paketler de bu aralığa doğal olarak dahil
// olur (bkz. schema/billing.ts clientPackageStatusEnum notu: otomatik bir
// cron status'u güncellemiyor, ekran expiresAt'i doğrudan karşılaştırır).
export async function listExpiringClientPackages(
  db: Database,
  clinicId: string,
  until: Date,
): Promise<ExpiringPackageRow[]> {
  return db
    .select({
      clientPackageId: clientPackages.id,
      clientId: clientPackages.clientId,
      clientFirstName: clients.firstName,
      clientLastName: clients.lastName,
      packageName: billingPackages.name,
      expiresAt: clientPackages.expiresAt,
      status: clientPackages.status,
    })
    .from(clientPackages)
    .innerJoin(billingPackages, eq(billingPackages.id, clientPackages.packageId))
    .innerJoin(clients, eq(clients.id, clientPackages.clientId))
    .where(
      and(
        eq(billingPackages.clinicId, clinicId),
        eq(clientPackages.status, 'aktif'),
        lte(clientPackages.expiresAt, until),
      ),
    )
    .orderBy(clientPackages.expiresAt)
    // clientPackages.expiresAt nullable — lte() bir NULL değere karşı hiçbir
    // zaman true dönmez (SQL üç değerli mantık), bu yüzden süresiz paketler
    // (expiresAt IS NULL) bu listeye ZATEN sızmaz, ayrı bir isNotNull şartına
    // gerek yok.
    .then((rows) => rows.filter((row): row is ExpiringPackageRow => row.expiresAt !== null))
}

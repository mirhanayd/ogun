// Randevu şeması — appointments, clinic_holidays, clinic_working_hours.
// clinic_working_hours, Prompt 3.2 (Onboarding ve uygulama kabuğu, GitHub
// issue #11) kapsamında eklendi çünkü onboarding'in 3. adımı (çalışma
// saatleri) bu tabloyu yazıyor. appointments ve clinic_holidays, GitHub
// issue #39 / Prompt 7.1 (Randevu takvimi) kapsamında BURAYA eklendi —
// AYNI dosyada tutuluyor çünkü üçü de aynı "müsaitlik" bağlamına ait
// (randevu modülü, çakışma + çalışma saati dışı uyarısı için üçünü birlikte
// okur, bkz. packages/db/src/queries/appointments.ts).
import { boolean, date, index, integer, pgEnum, pgTable, text, time, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { clients } from './clients'
import { clinics, users } from './tenancy'
import { id, timestamps } from './_helpers'

// dayOfWeek: ISO 8601 hafta günü — 1 = Pazartesi ... 7 = Pazar. DİKKAT:
// JavaScript'in Date.prototype.getDay() değeriyle (0 = Pazar ... 6 = Cumartesi)
// KARIŞTIRILMAMALI. getDay() değerinden dönüşüm gerekiyorsa: ((getDay() + 6) % 7) + 1.
//
// Klinik başına her gün için TEK satır olur (uniqueIndex clinicId+dayOfWeek) —
// isOpen=false ise o gün kapalı demektir, startTime/endTime yine de dolu
// tutulur (varsayılan bir aralık göstermek için) ama randevu modülü isOpen'a bakar.
export const clinicWorkingHours = pgTable(
  'clinic_working_hours',
  {
    id: id(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    dayOfWeek: integer('day_of_week').notNull(),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    isOpen: boolean('is_open').notNull().default(true),
    ...timestamps(),
  },
  (table) => [uniqueIndex('clinic_working_hours_clinic_id_day_of_week_idx').on(table.clinicId, table.dayOfWeek)],
)

// Klinik tatilleri — takvim müsaitlik hesabında clinicWorkingHours ile
// BİRLİKTE okunur (bir gün hem çalışma saati içinde OLABİLİR hem de o gün
// bir tatil günü OLABİLİR, ikinci durum önceliklidir). date BİLEREK
// mode:'string' (YYYY-MM-DD) — measurements.ts/clientGoals'taki
// targetDate/measuredAt desenleriyle aynı: tatil bir SAAT aralığı değil, TÜM
// gün.
export const clinicHolidays = pgTable(
  'clinic_holidays',
  {
    id: id(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    date: date('date', { mode: 'string' }).notNull(),
    description: text('description'),
    ...timestamps(),
  },
  (table) => [uniqueIndex('clinic_holidays_clinic_id_date_idx').on(table.clinicId, table.date)],
)

// Randevu tipleri — roadmap'te (Prompt 7.1, GÖREV 1) bire bir Türkçe verildi,
// clientStatusEnum/measurementSourceEnum ile AYNI gerekçe: ürünün kendi iş
// terimleri.
export const appointmentTypeEnum = pgEnum('appointment_type', [
  'ilk_görüşme',
  'kontrol',
  'online',
  'ölçüm',
])
export type AppointmentType = (typeof appointmentTypeEnum.enumValues)[number]

// Randevu durumları — 'ertelendi', sürükle-bırak ile erteleme akışında AYRI
// bir statü DEĞİL (tarih/saat güncellenir, statü 'planlandı' kalır); bu değer
// diyetisyenin BİLİNÇLİ olarak "ertelendi" işaretlediği (ör. danışan arayıp
// iptal etmeden erteleme talep ettiğinde) durumlar için.
export const appointmentStatusEnum = pgEnum('appointment_status', [
  'planlandı',
  'geldi',
  'gelmedi',
  'iptal',
  'ertelendi',
])
export type AppointmentStatus = (typeof appointmentStatusEnum.enumValues)[number]

export const appointments = pgTable(
  'appointments',
  {
    id: id(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id),
    // Randevuyu veren diyetisyen — assignedDietitianId (clients.ts) ile AYNI
    // desen: doğrudan users'a referans, "gerçekten bu klinikte dietitian
    // rolüyle üye mi" kontrolü sorgu katmanında yapılır.
    dietitianId: text('dietitian_id')
      .notNull()
      .references(() => users.id),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    type: appointmentTypeEnum('type').notNull().default('kontrol'),
    status: appointmentStatusEnum('status').notNull().default('planlandı'),
    location: text('location'),
    notes: text('notes'),
    // GitHub issue #40 (Prompt 7.2 — Paket ve tahsilat takibi) HENÜZ AÇILMADI
    // — bu yüzden client_packages/sessions tablosu bu repoda yok. Roadmap
    // (Prompt 7.1, GÖREV 1) packageSessionId'yi "nullable" olarak istedi;
    // gerçek bir FK hedefi olmadığı için BİLEREK düz (constraint'siz) bir
    // text sütun olarak açılıyor. #40 geldiğinde: (1) client_packages veya
    // ayrı bir "package_sessions" tablosuna gerçek bir .references() eklenir,
    // (2) mevcut satırlardaki (hepsi NULL olacak) veri kaybı olmaz. Randevu
    // sorgu/UI katmanı bu alana şimdilik HİÇ dokunmuyor.
    packageSessionId: text('package_session_id'),
    ...timestamps(),
  },
  (table) => [
    // Takvim görünümü (gün/hafta/ay) ve çakışma kontrolü — ikisi de
    // clinicId + tarih aralığı sorgusu; dietitianId ikinci sütun olarak
    // eklendi çünkü "diyetisyen bazlı filtre" (GÖREV 2) ve çakışma kontrolü
    // (GÖREV 3, aynı diyetisyenin aynı saatte iki randevusu olamaz) ikisi de
    // dietitianId'ye göre daralan sorgular.
    index('appointments_clinic_id_starts_at_idx').on(table.clinicId, table.startsAt),
    index('appointments_dietitian_id_starts_at_idx').on(table.dietitianId, table.startsAt),
    index('appointments_client_id_starts_at_idx').on(table.clientId, table.startsAt.desc()),
  ],
)

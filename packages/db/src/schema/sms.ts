// SMS gönderim kaydı — sms_logs.
//
// GitHub issue #41 / Prompt 7.3, GÖREV 3 (Netgsm SMS hatırlatma). "Kota
// takibi, gönderim logu" — kota BURADA ayrı bir sayaç sütunu olarak
// TUTULMUYOR (ör. clinics.smsQuotaUsed gibi); bunun yerine bu tablonun
// KENDİSİ log + kota kaynağıdır: bir dönemdeki kullanım, o dönemdeki
// status='gönderildi' satırlarının SAYISI olarak hesaplanır (bkz.
// packages/db/src/queries/sms.ts countSentSmsInPeriod) — subscriptions
// tablosunun currentPeriodStart/End'i ile AYNI dönem sınırını kullanır.
// Bu, billing.ts payments'ın "aylık gelir" hesabını AYRI bir sayaç sütunu
// yerine ham satırlardan türetmesiyle AYNI tasarım tercihi.
import { index, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { appointments } from './appointments'
import { clients } from './clients'
import { clinics } from './tenancy'
import { id } from './_helpers'

export const smsLogStatusEnum = pgEnum('sms_log_status', ['gönderildi', 'başarısız', 'rıza_yok'])
export type SmsLogStatus = (typeof smsLogStatusEnum.enumValues)[number]

export const smsLogs = pgTable(
  'sms_logs',
  {
    id: id(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id),
    // Randevu hatırlatması dışında (ileride) başka SMS türleri de bu tabloyu
    // kullanabilsin diye nullable — bugün TEK kullanım "24 saat önce
    // hatırlatma" (bkz. apps/web/src/lib/sms/reminder-eligibility.ts).
    appointmentId: text('appointment_id').references(() => appointments.id),
    phone: text('phone').notNull(),
    message: text('message').notNull(),
    status: smsLogStatusEnum('status').notNull(),
    // 'rıza_yok' durumunda provider hiç ÇAĞRILMAZ (bkz. reminder-eligibility.ts)
    // — bu satır yine de KAYDEDİLİR ki diyetisyen "neden gitmedi" sorusuna
    // (denetim/şeffaflık) bir yanıt bulabilsin, tıpkı audit_logs'un başarısız
    // denemeleri de loglaması gibi.
    provider: text('provider').notNull(),
    errorMessage: text('error_message'),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Kota hesabı VE gönderim geçmişi listesi — ikisi de clinicId + tarih
    // aralığı sorgusu (payments_clinic_id_paid_at_idx ile AYNI desen).
    index('sms_logs_clinic_id_sent_at_idx').on(table.clinicId, table.sentAt.desc()),
    // 24-saat-önce zamanlamasının aynı randevu için İKİNCİ KEZ hatırlatma
    // göndermediğini doğrulamak (dedupe) İÇİN — bkz.
    // packages/db/src/queries/sms.ts getSmsLogForAppointment.
    index('sms_logs_appointment_id_idx').on(table.appointmentId),
  ],
)

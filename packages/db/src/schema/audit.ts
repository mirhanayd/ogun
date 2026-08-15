// Denetim kaydı şeması — audit_logs.
//
// BAĞLAM (GitHub issue #12 / Prompt 3.3): sağlık verisi Türkiye'de KVKK
// kapsamında özel nitelikli kişisel veri sayılır. Danışan verisine dokunan
// HER işlem (okuma dahil — sadece mutasyonlar değil) burada bir iz bırakır.
// Otomatik kayıt mekanizması apps/web/src/lib/audit.ts withAudit() sarmalayıcısı
// üzerinden çalışır; bu dosya sadece depolama şemasıdır.
import { index, jsonb, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { clinics, users } from './tenancy'
import { id } from './_helpers'

export const auditActionEnum = pgEnum('audit_action', ['create', 'read', 'update', 'delete', 'export'])
export type AuditAction = (typeof auditActionEnum.enumValues)[number]

// NOT (createdAt/updatedAt kuralına kasıtlı istisna): projenin genel kuralı
// her tablonun _helpers.ts'teki timestamps() (createdAt + updatedAt) yardımcısını
// kullanmasıdır. audit_logs BİLEREK bunu kullanmaz — denetim kayıtları EKLENİR,
// asla GÜNCELLENMEZ (bir "updatedAt" alanı, denetim izinin sonradan
// değiştirilebileceği izlenimi verir ki bu, denetim kaydının bütünlüğü
// ilkesiyle çelişir). Bu yüzden sadece createdAt elle tanımlanıyor.
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: id(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    // Sistem tarafından tetiklenen işlemler için (ör. ileride kurulacak
    // otomatik kalıcı silme kuyruğu işçisi — bkz. queries/clients.ts
    // findClientsPastDeletionGracePeriod) userId NULL kalabilir.
    userId: text('user_id').references(() => users.id),
    action: auditActionEnum('action').notNull(),
    // Serbest metin: 'client' | 'diet_plan' | 'measurement' | ... İleride
    // eklenecek her yeni varlık türü için burada enum GENİŞLETMEYE gerek yok,
    // yeni tablolar geldikçe yeni string değerler kullanılır.
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Bir kliniğin denetim kayıtlarını en yeniden en eskiye listelemek için
    // (bkz. /ayarlar/veri-guvenligi sayfası) — GÖREV 1'de istenen indeks.
    index('audit_logs_clinic_id_created_at_idx').on(table.clinicId, table.createdAt.desc()),
    // Belirli bir varlığın (ör. tek bir danışanın) erişim geçmişini bulmak
    // için (bkz. veri sahibi hakları — dışa aktarma) — GÖREV 1'de istenen indeks.
    index('audit_logs_entity_type_entity_id_idx').on(table.entityType, table.entityId),
  ],
)

// Danışan şeması — clients, client_health.
//
// KAPSAM NOTU: danışan kaydının TAMAMI (ad, soyad, doğum tarihi, iletişim,
// client_health vb.) Hafta 4 / Prompt 4.1'de (henüz açılmamış, gelecek bir
// issue) kurulacak — roadmap'in kendi sıralamasına göre bu dosya o zamana
// kadar bir iskelet. Bu issue (GitHub #12 / Prompt 3.3, KVKK ve denetim
// kaydı) kapsamında SADECE şunlar için minimum bir `clients` tablosu açılıyor:
//   1. KVKK rıza alanlarını (aşağıda) bir yere "asmak",
//   2. Soft delete + 30 günlük kalıcı silme kuyruğu altyapısını göstermek,
//   3. audit_logs.entityId ile ilişkilendirilebilecek gerçek bir entityType
//      ('client') örneği sunmak (bkz. apps/web/src/lib/data-subject-rights.ts).
// Prompt 4.1 bu tabloya firstName/lastName/birthDate/... kolonlarını VE
// client_health tablosunu ekleyecek — burada demografik/sağlık geçmişi
// alanı YOK, bilerek.
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { clinics } from './tenancy'
import { id, softDelete, timestamps } from './_helpers'

export const clients = pgTable('clients', {
  id: id(),
  clinicId: text('clinic_id')
    .notNull()
    .references(() => clinics.id),

  // --- KVKK rıza alanları (GÖREV 3) ----------------------------------------
  // Genel KVKK aydınlatma metni onayı (KVKK m.10 aydınlatma yükümlülüğü).
  kvkkConsentAt: timestamp('kvkk_consent_at', { withTimezone: true }),
  // Onay anında geçerli olan aydınlatma metninin sürüm etiketi (ör. "2026-01").
  // Metin değişirse yeni sürüm için yeniden rıza istenebilsin diye tutulur.
  // Hukuki metnin KENDİSİ burada YOK — o ayrıca ürün sahibi tarafından
  // hazırlanacak (bkz. bu issue'nun BAĞLAM notu).
  kvkkConsentVersion: text('kvkk_consent_version'),
  // Özel nitelikli kişisel veri (sağlık verisi) için AYRI açık rıza
  // (KVKK m.6/2). KASITLI OLARAK kvkkConsentAt'tan bağımsız bir alan: genel
  // KVKK onayı ile özel nitelikli veri için açık rıza, iki farklı hukuki
  // dayanaktır ve tek bir onay kutusuyla birleştirilemez.
  explicitConsentAt: timestamp('explicit_consent_at', { withTimezone: true }),
  // Pazarlama iletişimi rızası — ayrı VE opsiyonel. Bir danışan kaydının
  // "tamamlanmış" sayılması için bu alan gerekmez (bkz. GÖREV 3 kuralı,
  // apps/web/src/lib/validation/client-schemas.ts).
  marketingConsentAt: timestamp('marketing_consent_at', { withTimezone: true }),

  // --- Veri sahibi hakları: silme (GÖREV 4) --------------------------------
  ...softDelete(), // deletedAt — soft delete anı (bkz. _helpers.ts)
  // Soft delete anında (bkz. queries/clients.ts softDeleteClient) "şimdi + 30
  // gün" olarak set edilir. Bu tarihi geçmiş VE deletedAt dolu kayıtlar kalıcı
  // silmeye uygun hale gelir (bkz. queries/clients.ts
  // findClientsPastDeletionGracePeriod) — ama bunu gerçekten silecek bir
  // cron/worker bu repoda HENÜZ YOK, o ayrı bir altyapı issue'sunun kapsamında.
  scheduledForDeletionAt: timestamp('scheduled_for_deletion_at', { withTimezone: true }),

  ...timestamps(),
})

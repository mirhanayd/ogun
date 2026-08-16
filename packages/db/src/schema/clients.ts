// Danışan şeması — clients, client_health.
//
// GitHub issue #17 / Prompt 4.1: bu dosya artık bir iskelet DEĞİL. Önceki
// (GitHub #12 / Prompt 3.3) sürümü sadece KVKK rıza alanları + soft delete
// altyapısını "asmak" için minimum bir clients tablosu açmıştı — demografik/
// iletişim/durum alanları BİLEREK yoktu. Bu issue o alanları ekliyor VE
// client_health tablosunu açıyor.
import { date, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { clinics, users } from './tenancy'
import { id, softDelete, timestamps } from './_helpers'

// Değerler BİLEREK İngilizce ('male' | 'female') — packages/nutrition-core
// src/energy-requirement.ts'teki Sex tipiyle (enerji ihtiyacı/BKMH
// hesaplarının girdisi) birebir uyumlu tutuluyor. Bu alan ileride doğrudan o
// hesaplara aktarılacağı için burada da aynı sözlüğü kullanmak, aradaki her
// çağrı noktasında bir 'kadın'->'female' çevirisi yapmak zorunda kalmaktan
// daha az hataya açık. UI katmanı zaten Türkçe etiketlerle gösterir (bkz.
// apps/web/src/lib/validation/client-schemas.ts SEX_LABELS_TR).
export const clientSexEnum = pgEnum('client_sex', ['male', 'female'])
export type ClientSex = (typeof clientSexEnum.enumValues)[number]

// Değerler roadmap'te (Prompt 4.1, GÖREV 1) BİRE BİR bu şekilde Türkçe
// verildi — clinicMemberRoleEnum gibi teknik/İngilizce bir sözlük değil,
// ürünün kendi iş terimleri (diyetisyenin arayüzde göreceği durum etiketiyle
// veritabanı değeri aynı). measurements.source alanındaki 'inbody'/'tanita'
// gibi marka/domain terimleriyle aynı gerekçe.
export const clientStatusEnum = pgEnum('client_status', ['aktif', 'pasif', 'arşiv'])
export type ClientStatus = (typeof clientStatusEnum.enumValues)[number]

export const clients = pgTable(
  'clients',
  {
    id: id(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),

    // --- Demografik / iletişim (GitHub #17 / Prompt 4.1, GÖREV 1 + GÖREV 3) --
    // "Tek sayfalık, hızlı" yeni danışan formunun (GÖREV 3) zorunlu tuttuğu
    // alanlar sadece firstName/lastName — telefon/doğum tarihi/cinsiyet
    // formda İSTENİYOR ama DB seviyesinde notNull DEĞİL: 15 saniyeden kısa
    // kayıt hedefiyle "ad+soyad girip Enter'a bas" akışını da bloklamamak
    // için (bkz. apps/web/src/lib/validation/client-schemas.ts
    // newClientSchema — form seviyesinde hangi alanlar zorunlu, orada net).
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    birthDate: date('birth_date', { mode: 'string' }),
    sex: clientSexEnum('sex'),
    phone: text('phone'),
    email: text('email'),
    occupation: text('occupation'),
    // Danışanın kliniği nereden duyduğu (ör. "Instagram", "Tavsiye/referans",
    // "Google araması") — serbest metin, sabit bir seçenek listesi bu issue
        // kapsamında İSTENMEDİ, ileride pazarlama raporlama ihtiyacı çıkarsa bir
    // enum'a evrilebilir.
    referralSource: text('referral_source'),
    notes: text('notes'),
    status: clientStatusEnum('status').notNull().default('aktif'),
    // Atanan diyetisyen — clinicMembers'a değil DOĞRUDAN users'a referans
    // veriyor (bkz. schema/tenancy.ts clinics.createdBy ile aynı desen).
    // "Bu kullanıcı gerçekten bu klinikte dietitian rolüyle üye mi" kontrolü
    // BİLEREK burada bir FK/CHECK kısıtı DEĞİL — assign action'ı bunu sorgu
    // katmanında doğrular (bkz. packages/db/src/queries/clients.ts
    // assignDietitianToClient), tıpkı ClinicScope'un "clinicId'siz sorgu
    // yazılamaz" kuralını tip sisteminde değil apps/web tarafında zorlaması
    // gibi (bkz. apps/web/src/lib/authz.ts).
    assignedDietitianId: text('assigned_dietitian_id').references(() => users.id),

    // --- KVKK rıza alanları (GitHub #12 / Prompt 3.3, GÖREV 3) --------------
    // Genel KVKK aydınlatma metni onayı (KVKK m.10 aydınlatma yükümlülüğü).
    kvkkConsentAt: timestamp('kvkk_consent_at', { withTimezone: true }),
    // Onay anında geçerli olan aydınlatma metninin sürüm etiketi (ör. "2026-01").
    // Metin değişirse yeni sürüm için yeniden rıza istenebilsin diye tutulur.
    // Hukuki metnin KENDİSİ burada YOK — o ayrıca ürün sahibi tarafından
    // hazırlanacak.
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

    // --- Veri sahibi hakları: silme (GitHub #12 / Prompt 3.3, GÖREV 4) ------
    ...softDelete(), // deletedAt — soft delete anı (bkz. _helpers.ts)
    // Soft delete anında (bkz. queries/clients.ts softDeleteClient) "şimdi + 30
    // gün" olarak set edilir. Bu tarihi geçmiş VE deletedAt dolu kayıtlar kalıcı
    // silmeye uygun hale gelir (bkz. queries/clients.ts
    // findClientsPastDeletionGracePeriod) — ama bunu gerçekten silecek bir
    // cron/worker bu repoda HENÜZ YOK, o ayrı bir altyapı issue'sunun kapsamında.
    scheduledForDeletionAt: timestamp('scheduled_for_deletion_at', { withTimezone: true }),

    ...timestamps(),
  },
  (table) => [
    // Danışan listesi (GÖREV 2) HER ZAMAN clinicId + soft-delete durumuna göre
    // filtrelenir (bkz. authz.ts ClinicScope kuralı) — bu ikisi en sık
    // kullanılan sorgu deseni.
    index('clients_clinic_id_deleted_at_idx').on(table.clinicId, table.deletedAt),
    // Durum filtresi (GÖREV 2 — "durum" filtresi) aynı klinik içinde.
    index('clients_clinic_id_status_idx').on(table.clinicId, table.status),
    // "Atanan diyetisyen" filtresi (GÖREV 2).
    index('clients_clinic_id_assigned_dietitian_id_idx').on(table.clinicId, table.assignedDietitianId),
  ],
)

// Danışan sağlık geçmişi — anamnezin İLK/temel katmanı. GÖREV 4'te "Genel"
// sekmesine küçük bir özet olarak gömülmesi düşünüldü ama BİLEREK
// yapılmadı: tam anamnez formu (semptom sorgulama, beslenme öyküsü vb.)
// GitHub issue #19 / Prompt 4.3'ün kapsamı. Bu tablo o forma erken
// başlangıç sağlamak için şimdiden açılıyor (roadmap GÖREV 1'in istediği
// gibi) ama bu issue'da ona bağlı bir UI YOK — #19 gelince "Anamnez"
// sekmesi bu tabloyu okuyup/yazacak.
export const clientHealth = pgTable(
  'client_health',
  {
    id: id(),
    // Danışan başına TEK sağlık profili satırı.
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id),
    // Serbest metin liste alanları — sabit bir ICD-10 vb. kodlama şeması bu
    // issue kapsamında YOK, o #19'un (laboratuvar/anamnez) kapsamında
    // değerlendirilebilir. Şimdilik diyetisyenin kendi yazdığı kısa etiketler.
    conditions: jsonb('conditions').$type<string[]>(),
    medications: jsonb('medications').$type<string[]>(),
    allergies: jsonb('allergies').$type<string[]>(),
    intolerances: jsonb('intolerances').$type<string[]>(),
    surgeries: text('surgeries'),
    familyHistory: text('family_history'),
    smokingStatus: text('smoking_status'),
    alcoholUse: text('alcohol_use'),
    sleepHours: integer('sleep_hours'),
    bowelHabits: text('bowel_habits'),
    waterIntakeMl: integer('water_intake_ml'),
    ...timestamps(),
  },
  (table) => [uniqueIndex('client_health_client_id_idx').on(table.clientId)],
)

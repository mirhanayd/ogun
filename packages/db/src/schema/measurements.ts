// Ölçüm ve hedef takibi — measurements, client_goals.
//
// GitHub issue #18 / Prompt 4.2. clients.ts'teki clientHealth ile AYNI desen:
// bu iki tabloda da doğrudan bir clinicId sütunu YOK — clinicId, clientId
// üzerinden clients tablosuna JOIN edilerek doğrulanır (bkz.
// packages/db/src/queries/measurements.ts, her sorgu clients ile INNER JOIN
// yaparak clients.clinicId = :clinicId şartını uygular). Bu, authz.ts'teki
// ClinicScope kuralının ("danışan verisine dokunan sorgu clinicId'siz
// yazılamaz") ihlali DEĞİL — sadece clinicId'nin bu tablolarda TEKRAR
// depolanmaması (normalizasyon), doğrulamanın hâlâ her sorguda zorunlu
// olması anlamına gelir.
//
// Hesaplanan alanlar (BKİ, bel-kalça oranı, bel-boy oranı, ideal kilo
// aralığı) BİLEREK burada birer SÜTUN DEĞİL — roadmap'in GÖREV 1'i bunu açıkça
// istiyor ("kolon olarak DEĞİL, sorgu/motor tarafında"). Bu saf hesap
// fonksiyonları packages/nutrition-core/src/body-composition.ts'te —
// nutrition-core zaten "girdi verilen saf hesap fonksiyonları" için doğru
// paket (bkz. energy-requirement.ts, warnings.ts aynı desen: DB/React'tan
// habersiz, sadece sayı içeri sayı dışarı). measurements sorgu katmanı
// (packages/db/src/queries/measurements.ts) bu fonksiyonları çağırıp DTO'ya
// gömer.
import {
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'
import { clients } from './clients'
import { users } from './tenancy'
import { id, timestamps } from './_helpers'

// BİA (biyoelektrik empedans analizi) cihaz markaları + manuel giriş — roadmap
// GÖREV 1'de bire bir bu şekilde verildi. clients.ts'teki clientStatusEnum
// üstündeki notla aynı gerekçe: bunlar ürünün kendi domain terimleri
// (diyetisyenin göreceği kaynak etiketiyle DB değeri aynı), teknik bir
// sözlük değil.
export const measurementSourceEnum = pgEnum('measurement_source', [
  'manuel',
  'inbody',
  'tanita',
  'accuniq',
])
export type MeasurementSource = (typeof measurementSourceEnum.enumValues)[number]

// Hedef tipleri — roadmap GÖREV 4'te bire bir bu şekilde (Türkçe) verildi.
export const goalTypeEnum = pgEnum('client_goal_type', ['kilo', 'yağ_oranı', 'çevre'])
export type GoalType = (typeof goalTypeEnum.enumValues)[number]

// Tüm ondalık ölçü sütunları BİLEREK numeric (precision/scale'li) — foods.ts
// (valuePer100g, grams vb.) ile AYNI desen: drizzle-orm 0.38'de numeric()
// mode:'number' DESTEKLEMİYOR (data type her zaman 'string'), bu yüzden bu
// paket genelinde numeric sütunlar string olarak okunur/yazılır — sorgu/hesap
// katmanı gerektiğinde Number() ile çevirir (bkz. queries/measurements.ts).
export const measurements = pgTable(
  'measurements',
  {
    id: id(),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id),
    // Ölçümün YAPILDIĞI an — kayıt anı DEĞİL (createdAt zaten onu tutuyor).
    // Diyetisyen geçmiş bir ölçümü (ör. bir önceki seans notundan) geriye
    // dönük girebilir; grafikler ve trend hesapları measuredAt'e göre sıralanır.
    measuredAt: timestamp('measured_at', { withTimezone: true }).notNull().defaultNow(),
    source: measurementSourceEnum('source').notNull().default('manuel'),

    // --- Temel (hızlı mod GÖREV 2'nin tek alanı) ----------------------------
    weightKg: numeric('weight_kg', { precision: 5, scale: 2 }),
    // Danışan başına genelde SABİT ama BİLEREK her ölçümde tekrar tutulur —
    // BKİ hesabı (nutrition-core body-composition.ts) her ölçüm satırının
    // KENDİ boy değerine göre çalışabilsin diye (boy güncellemesi geçmiş
    // ölçümlerin BKİ'sini geriye dönük bozmasın).
    heightCm: numeric('height_cm', { precision: 5, scale: 1 }),

    // --- Çevre ölçümleri (detaylı mod) --------------------------------------
    waistCm: numeric('waist_cm', { precision: 5, scale: 1 }),
    hipCm: numeric('hip_cm', { precision: 5, scale: 1 }),
    neckCm: numeric('neck_cm', { precision: 5, scale: 1 }),
    armCm: numeric('arm_cm', { precision: 5, scale: 1 }),
    thighCm: numeric('thigh_cm', { precision: 5, scale: 1 }),
    chestCm: numeric('chest_cm', { precision: 5, scale: 1 }),

    // --- Vücut kompozisyonu (BİA cihazından — detaylı mod) ------------------
    bodyFatPct: numeric('body_fat_pct', { precision: 4, scale: 1 }),
    bodyFatKg: numeric('body_fat_kg', { precision: 5, scale: 2 }),
    leanMassKg: numeric('lean_mass_kg', { precision: 5, scale: 2 }),
    muscleMassKg: numeric('muscle_mass_kg', { precision: 5, scale: 2 }),
    totalBodyWaterL: numeric('total_body_water_l', { precision: 5, scale: 2 }),
    visceralFatLevel: integer('visceral_fat_level'),
    bmrKcal: integer('bmr_kcal'),
    // BİA cihazlarının (ör. InBody) yayınladığı faz açısı (derece) — hücre
    // zarı bütünlüğünün bir göstergesi, tipik aralık ~4-10.
    phaseAngle: numeric('phase_angle', { precision: 4, scale: 2 }),

    notes: text('notes'),
    // Ölçümü giren kullanıcı — assignedDietitianId (clients.ts) ile AYNI
    // desen: doğrudan users'a referans, "gerçekten bu klinikte üye mi"
    // kontrolü sorgu katmanında değil (o zaten oturum sahibi ctx.user.id).
    recordedBy: text('recorded_by').references(() => users.id),

    ...timestamps(),
  },
  (table) => [
    // Bir danışanın ölçüm geçmişini (grafikler, "önceki ölçüme göre fark")
    // en yeniden en eskiye çekmek — bu tablonun EN SIK kullanılan sorgu deseni.
    index('measurements_client_id_measured_at_idx').on(table.clientId, table.measuredAt.desc()),
  ],
)

// Hedef takibi (GÖREV 4). Bir danışanın AYNI tipte birden fazla (geçmiş +
// aktif) hedefi olabilir — uniqueness kısıtı BİLEREK yok; "aktif hedef" =
// achievedAt IS NULL olan, startedAt'e göre en yeni satır (bkz.
// queries/measurements.ts getActiveGoal).
export const clientGoals = pgTable(
  'client_goals',
  {
    id: id(),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id),
    type: goalTypeEnum('type').notNull(),
    targetValue: numeric('target_value', { precision: 6, scale: 2 }).notNull(),
    // Diyetisyenin koyduğu isteğe bağlı bir son tarih — GÖREV 4'ün "tahmini
    // hedefe varış tarihi" (trend'den hesaplanan) BUNUNLA KARIŞTIRILMAMALI:
    // targetDate kullanıcının koyduğu hedef, tahmini varış tarihi ise
    // nutrition-core/goal-projection.ts'in trend eğiminden hesapladığı ayrı
    // bir değer (bkz. o dosyanın üstündeki not).
    targetDate: date('target_date', { mode: 'string' }),
    startValue: numeric('start_value', { precision: 6, scale: 2 }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    achievedAt: timestamp('achieved_at', { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    // Aktif hedefi bulmak (achievedAt IS NULL) + geçmişi listelemek için.
    index('client_goals_client_id_started_at_idx').on(table.clientId, table.startedAt.desc()),
  ],
)

// Diyet planı şeması — diet_plans, plan_days, plan_meals, plan_items,
// plan_item_alternatives. GitHub issue #23 / Prompt 5.1 (roadmap "HAFTA 5–6
// — Plan Editörü (Ürünün Kalbi)").
//
// BAĞLAM: bu modül ürünün var oluş sebebi — roadmap'in kendi ifadesiyle
// "şemayı esnek kur, sonradan değiştirmek pahalı olur". Bu issue SADECE
// şema + sorgu katmanı + server action'ları kapsar: gerçek plan editörü UI'ı
// (#25), besin arama (#24), nutrition-core'un computedTotals'ı doldurması
// (#25/#26) ve değişim listesi modu (#28) hepsi bu şemanın ÜSTÜNE inşa
// edilecek sonraki issue'lar.
//
// nutrition-core UYUMLULUĞU: packages/nutrition-core/src/types.ts şu an
// PlanItem/PlanMeal/PlanDay/DietPlan gibi DB-şekilli tipler TANIMLAMIYOR —
// o paket kasıtlı olarak DB şemasına bağımlı değil (bkz. o dosyanın başındaki
// not) ve şu an Meal/MealItem/DailyPlan gibi daha soyut, saf hesap tipleri
// kullanıyor. Bu şemadaki plan_items.amount + portionId + foodId/recipeId
// üçlüsü, ileride (bkz. plan.ts calculatePlan) bir MealItem{food, grams}
// listesine dönüştürülüp nutrition-core'a verilecek — dönüşüm bu issue'nun
// KAPSAMI DIŞINDA, sadece şeklin uyumlu olduğunu burada not ediyoruz.
import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'
import { foodPortions, foods } from './foods'
import { recipes } from './recipes'
import { clients } from './clients'
import { clinics, users } from './tenancy'
import { id, timestamps } from './_helpers'

// --- Ortak enum'lar ----------------------------------------------------------

// Roadmap metninde (Prompt 5.1, GÖREV 1) bire bir bu şekilde Türkçe verildi —
// clients.ts clientStatusEnum üstündeki notla AYNI gerekçe: ürünün kendi
// domain terimleri.
export const planTypeEnum = pgEnum('plan_type', ['günlük', 'haftalık', 'değişim'])
export type PlanType = (typeof planTypeEnum.enumValues)[number]

export const planStatusEnum = pgEnum('plan_status', ['taslak', 'aktif', 'arşiv'])
export type PlanStatus = (typeof planStatusEnum.enumValues)[number]

// GÖREV 3 — şablon kategorisi. Sadece isTemplate=true satırlarda anlamlı,
// diğerlerinde NULL kalır (bkz. diet_plans.templateCategory).
export const planTemplateCategoryEnum = pgEnum('plan_template_category', [
  'diyabet',
  'kilo_verme',
  'kilo_alma',
  'gebelik',
  'sporcu',
  'çölyak',
  'böbrek',
  'karaciğer',
  'genel',
])
export type PlanTemplateCategory = (typeof planTemplateCategoryEnum.enumValues)[number]

export const planMealTypeEnum = pgEnum('plan_meal_type', [
  'kahvaltı',
  'ara1',
  'öğle',
  'ara2',
  'akşam',
  'gece',
])
export type PlanMealType = (typeof planMealTypeEnum.enumValues)[number]

// --- Hesaplanmış değer önbelleği tipi (GÖREV 2) -------------------------------

// nutrition-core/src/plan.ts PlanCalculationResult ile UYUMLU şekilde
// tasarlandı (totalNutrients + öğün bazlı kırılım) — birebir o tipi import
// ETMİYORUZ çünkü computedTotals ayrıca targetKcal'a göre sapma/uyarı özeti
// gibi plan-şemasına-özgü alanlar da taşıyabilir; bu issue'da sadece ŞEKLİ
// sabitliyoruz, DOLDURMA mantığı #25/#26'nın kapsamında.
export interface ComputedPlanTotals {
  totalNutrients: Record<string, number>
  mealTotals: Array<{ mealId: string; nutrients: Record<string, number> }>
  dayTotals: Array<{ dayId: string; nutrients: Record<string, number> }>
  warnings?: string[]
}

// --- diet_plans ---------------------------------------------------------------

export const dietPlans = pgTable(
  'diet_plans',
  {
    id: id(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    // NULL = şablon (bkz. isTemplate) — roadmap'in kendi tanımı: "plan_templates
    // aslında diet_plans'ın isTemplate=true hali", ayrı bir tablo YOK.
    clientId: text('client_id').references(() => clients.id),
    name: text('name').notNull(),
    startDate: timestamp('start_date', { withTimezone: true }),
    endDate: timestamp('end_date', { withTimezone: true }),
    // Hedef enerji (kcal) — diyetisyenin plan yazarken hedeflediği değer,
    // nutrition-core'un computedTotals.totalNutrients'ından HESAPLANAN
    // gerçek değerle KARIŞTIRILMAMALI (biri hedef, diğeri sonuç).
    targetKcal: integer('target_kcal'),
    // { proteinPct, carbPct, fatPct } gibi bir şekil bekleniyor ama TAM tip
    // nutrition-core/src/distribution.ts'in (Hafta 2) çıktısına bağlı —
    // burada kasıtlı olarak Record<string, number> gibi geniş bırakıldı,
    // dar bir tip nutrition-core'un gerçek MacroDistribution şeklini
        // burada TEKRARLAMAK zorunda bırakırdı.
    targetMacros: jsonb('target_macros').$type<Record<string, number>>(),
    planType: planTypeEnum('plan_type').notNull().default('günlük'),
    status: planStatusEnum('status').notNull().default('taslak'),
    isTemplate: boolean('is_template').notNull().default(false),
    templateCategory: planTemplateCategoryEnum('template_category'),
    createdBy: text('created_by').references(() => users.id),
    notes: text('notes'),
    generalInstructions: text('general_instructions'),

    // --- GÖREV 2: hesaplanmış değer önbelleği ---------------------------------
    // Plan kaydedildiğinde sunucuda nutrition-core ile hesaplanıp buraya
    // yazılır (bkz. dosya başı notu — bu issue'da DOLDURULMUYOR, sadece
    // sütun şekli hazırlanıyor). Liste ekranları yeniden hesaplamak yerine
    // BUNU okur.
    computedTotals: jsonb('computed_totals').$type<ComputedPlanTotals>(),
    computedAt: timestamp('computed_at', { withTimezone: true }),

    // GitHub issue #27 / Prompt 5.5 — "kaç kez kullanıldı" sayacı (şablon
    // kütüphanesi kartlarında gösterilecek). Bir DERİVE edilmiş sorgu
    // (ör. "bu id'yi sourcePlanId olarak referans alan kaç kopya var")
    // yerine BİLEREK bir sayaç sütunu seçildi — çünkü clonePlanInternal
    // (bkz. queries/plans.ts) kopyanın kaynağını KALICI OLARAK saklamıyor
    // (targetClientId override'ı sadece o an geçiliyor, tabloda bir
    // sourcePlanId sütunu yok), bu yüzden "kaç kopya" sorusu geriye dönük
    // sorgulanamaz olurdu. Sayaç yalnızca "bu ŞABLONdan gerçek bir danışan
    // planı üretildiğinde" (isTemplate=true kaynaktan isTemplate=false hedefe
    // klonlanınca) artar — bkz. clonePlanInternal içindeki artış noktası.
    templateUsageCount: integer('template_usage_count').notNull().default(0),

    ...timestamps(),
  },
  (table) => [
    // Danışan bazlı plan listesi (aktif/taslak/arşiv sekmeleri) — clients
    // tablosundaki clinicId+deletedAt indeksiyle AYNI en sık sorgu deseni.
    index('diet_plans_clinic_id_client_id_idx').on(table.clinicId, table.clientId),
    // Şablon listesi — clientId NULL, isTemplate=true, kategoriye göre filtre.
    index('diet_plans_clinic_id_is_template_idx').on(table.clinicId, table.isTemplate),
    index('diet_plans_clinic_id_status_idx').on(table.clinicId, table.status),
  ],
)

// --- plan_days -----------------------------------------------------------------

export const planDays = pgTable(
  'plan_days',
  {
    id: id(),
    planId: text('plan_id')
      .notNull()
      .references(() => dietPlans.id),
    // 1'den başlar ('günlük' planda tek gün = 1, 'haftalık' planda 1-7).
    dayNumber: integer('day_number').notNull(),
    dayLabel: text('day_label'),
    notes: text('notes'),
  },
  (table) => [
    index('plan_days_plan_id_day_number_idx').on(table.planId, table.dayNumber),
  ],
)

// --- plan_meals ------------------------------------------------------------

export const planMeals = pgTable(
  'plan_meals',
  {
    id: id(),
    dayId: text('day_id')
      .notNull()
      .references(() => planDays.id),
    mealType: planMealTypeEnum('meal_type').notNull(),
    // Saat serbest metin ('08:00' gibi) DEĞİL, gerçek bir clock-time — ama
    // tarih bileşeni anlamsız olduğu için timestamp yerine text tutuluyor
    // (measurements.ts'teki "hesaplanan alan kolon değil" kuralına benzer
    // şekilde: burada asıl kısıt "sadece saat:dakika", pg'nin `time` tipi
    // drizzle-orm 0.38'de foods.ts/measurements.ts'teki numeric mode
        // sorunuyla aynı ailede ek karmaşıklık yaratmasın diye BİLEREK text).
    time: text('time'),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    notes: text('notes'),
  },
  (table) => [index('plan_meals_day_id_sort_order_idx').on(table.dayId, table.sortOrder)],
)

// --- plan_items --------------------------------------------------------------
//
// CHECK kısıtı: foodId, recipeId, freeText'ten TAM OLARAK biri dolu olmalı.
// drizzle-orm 0.38 pg-core check() DB seviyesinde gerçek bir CHECK
// constraint üretir (bkz. import check) — bu yüzden burada hem DB seviyesinde
// (veri bütünlüğü, ETL/elle SQL yazımlarına karşı da geçerli) hem de
// apps/web tarafında Zod .refine() ile (bkz.
// apps/web/src/lib/validation/plan-schemas.ts planItemInputSchema) AYNI
// invaryant iki katmanda uygulanıyor — foods.ts'teki gibi "kaynaklar
// çakıştığında hangisi kazanır" tipi başka bir örnek bulunmadığından burada
// desen SIFIRDAN kuruldu.
const exactlyOneItemSourceCheck = check(
  'plan_items_exactly_one_source_check',
  sql`(
    (CASE WHEN food_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN recipe_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN free_text IS NOT NULL THEN 1 ELSE 0 END)
  ) = 1`,
)

export const planItems = pgTable(
  'plan_items',
  {
    id: id(),
    mealId: text('meal_id')
      .notNull()
      .references(() => planMeals.id),
    foodId: text('food_id').references(() => foods.id),
    recipeId: text('recipe_id').references(() => recipes.id),
    // Diyetisyenin foods/recipes veritabanında karşılığı olmayan serbest
    // metin bir kalem girmesi için (ör. "1 avuç kuruyemiş, markette ne
    // varsa") — nutrient hesaplaması bu kalemler için YAPILAMAZ, sadece
    // görüntülenir (bkz. warnings kanalı, nutrition-core/src/warnings.ts).
    freeText: text('free_text'),
    amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
    portionId: text('portion_id').references(() => foodPortions.id),
    sortOrder: integer('sort_order').notNull().default(0),
    isOptional: boolean('is_optional').notNull().default(false),
    note: text('note'),
  },
  (table) => [
    index('plan_items_meal_id_sort_order_idx').on(table.mealId, table.sortOrder),
    exactlyOneItemSourceCheck,
  ],
)

// --- plan_item_alternatives ---------------------------------------------------
//
// Bir plan kaleminin altında "veya" (OR) alternatifleri — roadmap: "aynı
// alan şekli, ama itemId'ye bağlı". plan_items ile AYNI kısıt (foodId/
// recipeId/freeText'ten tam biri) burada da geçerli, AYNI check() deseniyle
// tekrarlanıyor (iki tabloyu tek bir polymorphic tabloya birleştirmek —
// ör. bir "parentType" ayrımcı sütunu — burada BİLEREK YAPILMADI: plan_items
// ve plan_item_alternatives farklı foreign key hedeflerine (mealId vs itemId)
// bağlanıyor, birleştirme FK bütünlüğünü zayıflatırdı).
const exactlyOneAlternativeSourceCheck = check(
  'plan_item_alternatives_exactly_one_source_check',
  sql`(
    (CASE WHEN food_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN recipe_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN free_text IS NOT NULL THEN 1 ELSE 0 END)
  ) = 1`,
)

export const planItemAlternatives = pgTable(
  'plan_item_alternatives',
  {
    id: id(),
    itemId: text('item_id')
      .notNull()
      .references(() => planItems.id),
    foodId: text('food_id').references(() => foods.id),
    recipeId: text('recipe_id').references(() => recipes.id),
    freeText: text('free_text'),
    amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
    portionId: text('portion_id').references(() => foodPortions.id),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [
    index('plan_item_alternatives_item_id_sort_order_idx').on(table.itemId, table.sortOrder),
    exactlyOneAlternativeSourceCheck,
  ],
)

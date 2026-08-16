// Öğün blokları kütüphanesi — GitHub issue #27 / Prompt 5.5, GÖREV 3:
// "saved_meals tablosu: sık kullanılan öğün kombinasyonları ('standart
// kahvaltı', 'protein ağırlıklı ara öğün')". Şeklini plan_meals/plan_items'a
// (bkz. schema/plans.ts) BİLEREK ÇOK YAKIN tuttuk — spec'in kendi ifadesiyle
// "bir öğün bloğunu kaydetmek ve sonra bir plana geri eklemek düz bir KOPYA
// olsun, yeniden türetme (re-derivation) OLMASIN". Bu yüzden saved_meal_items
// plan_items ile AYNI beş alanı (foodId/recipeId/freeText/amount/portionId)
// ve AYNI "tam olarak bir kaynak" CHECK kısıtını taşıyor — insertSavedMealIntoMeal
// (bkz. queries/saved-meals.ts) bu satırları neredeyse birebir plan_items'a
// kopyalayabiliyor.
//
// plan_item_alternatives'ın burada KARŞILIĞI YOK — bir öğün bloğunu kaydetmek
// "VEYA" alternatiflerini de taşımayı GEREKTİRMEZ (spec sadece "kombinasyon"
// diyor, alternatif zinciri değil); diyetisyen isterse ekledikten sonra plan
// içinde alternatif ekleyebilir.
import { sql } from 'drizzle-orm'
import { boolean, check, index, integer, numeric, pgTable, text } from 'drizzle-orm/pg-core'
import { foodPortions, foods } from './foods'
import { recipes } from './recipes'
import { clinics, users } from './tenancy'
import { planMealTypeEnum } from './plans'
import { id, timestamps } from './_helpers'

export const savedMeals = pgTable(
  'saved_meals',
  {
    id: id(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    // plan_meals.mealType ile AYNI enum — "kaydet" ikonu tıklandığında
    // kaynak öğünün mealType'ı devralınır (bkz. meal-block.tsx), diyetisyen
    // isterse değiştirebilir.
    mealType: planMealTypeEnum('meal_type').notNull(),
    name: text('name').notNull(),
    notes: text('notes'),
    createdBy: text('created_by').references(() => users.id),
    ...timestamps(),
  },
  (table) => [
    // "@" tetikleyicisinin (bkz. food-search-input.tsx) klinik bazlı listeyi
    // hızlıca çekmesi için — küçük bir tablo (klinik başına onlarca kayıt),
    // foods.searchText'teki gibi bir GIN/trigram indeksi GEREKMEZ.
    index('saved_meals_clinic_id_idx').on(table.clinicId),
    index('saved_meals_clinic_id_meal_type_idx').on(table.clinicId, table.mealType),
  ],
)

const exactlyOneSavedMealItemSourceCheck = check(
  'saved_meal_items_exactly_one_source_check',
  sql`(
    (CASE WHEN food_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN recipe_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN free_text IS NOT NULL THEN 1 ELSE 0 END)
  ) = 1`,
)

export const savedMealItems = pgTable(
  'saved_meal_items',
  {
    id: id(),
    savedMealId: text('saved_meal_id')
      .notNull()
      .references(() => savedMeals.id),
    foodId: text('food_id').references(() => foods.id),
    recipeId: text('recipe_id').references(() => recipes.id),
    freeText: text('free_text'),
    amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
    portionId: text('portion_id').references(() => foodPortions.id),
    sortOrder: integer('sort_order').notNull().default(0),
    isOptional: boolean('is_optional').notNull().default(false),
    note: text('note'),
  },
  (table) => [
    index('saved_meal_items_saved_meal_id_sort_order_idx').on(table.savedMealId, table.sortOrder),
    exactlyOneSavedMealItemSourceCheck,
  ],
)

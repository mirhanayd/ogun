import { boolean, integer, numeric, pgTable, text } from 'drizzle-orm/pg-core'
import { foodPortions, foods } from './foods'
import { id, timestamps } from './_helpers'

// clinicId nullable = sistem tarifi (tüm kliniklerce görülebilir). Dolu olduğunda
// tenancy şeması kurulana kadar (Prompt 3.1) FK eklenmiyor, sadece serbest metin id.
export const recipes = pgTable('recipes', {
  id: id(),
  clinicId: text('clinic_id'),
  nameTr: text('name_tr').notNull(),
  servings: integer('servings').notNull().default(1),
  cookingMethod: text('cooking_method'),
  totalYieldGrams: numeric('total_yield_grams', { precision: 10, scale: 2 }),
  instructions: text('instructions'),
  isPublic: boolean('is_public').notNull().default(false),
  ...timestamps(),
})

export const recipeIngredients = pgTable('recipe_ingredients', {
  id: id(),
  recipeId: text('recipe_id')
    .notNull()
    .references(() => recipes.id),
  foodId: text('food_id')
    .notNull()
    .references(() => foods.id),
  amountGrams: numeric('amount_grams', { precision: 10, scale: 2 }).notNull(),
  portionId: text('portion_id').references(() => foodPortions.id),
  sortOrder: integer('sort_order').notNull().default(0),
})

// Tarifin hesaplanmış besin değeri burada materialized view olarak TUTULMUYOR.
// Bu hesap runtime'da packages/nutrition-core içinde yapılacak (bkz. Hafta 2),
// çünkü verim/pişirme faktörleri değiştikçe view'ı senkron tutmak veritabanı
// katmanında gereksiz karmaşıklık yaratır.

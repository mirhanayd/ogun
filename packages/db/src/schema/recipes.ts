import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'
import { catalogEditorialStatusEnum, foodPortions, foods } from './foods'
import { id, timestamps } from './_helpers'

// clinicId nullable = sistem tarifi (tüm kliniklerce görülebilir). Dolu olduğunda
// tenancy şeması kurulana kadar (Prompt 3.1) FK eklenmiyor, sadece serbest metin id.
export const recipes = pgTable(
  'recipes',
  {
    id: id(),
    clinicId: text('clinic_id'),
    nameTr: text('name_tr').notNull(),
    servings: integer('servings').notNull().default(1),
    cookingMethod: text('cooking_method'),
    totalYieldGrams: numeric('total_yield_grams', { precision: 10, scale: 2 }),
    instructions: text('instructions'),
    isPublic: boolean('is_public').notNull().default(false),
    isPlatformManaged: boolean('is_platform_managed').notNull().default(false),
    editorialStatus: catalogEditorialStatusEnum('editorial_status').notNull().default('published'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    publishedByPlatformStaffId: text('published_by_platform_staff_id'),
    ...timestamps(),
  },
  (table) => [
    index('recipes_platform_status_updated_idx').on(
      table.isPlatformManaged,
      table.editorialStatus,
      table.updatedAt.desc(),
    ),
    check('recipes_servings_positive_check', sql`${table.servings} >= 1`),
    check(
      'recipes_yield_positive_check',
      sql`${table.totalYieldGrams} is null or ${table.totalYieldGrams} > 0`,
    ),
  ],
)

export const recipeIngredients = pgTable(
  'recipe_ingredients',
  {
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
  },
  (table) => [check('recipe_ingredients_positive_grams_check', sql`${table.amountGrams} > 0`)],
)

export const recipeSourceReferences = pgTable(
  'recipe_source_references',
  {
    id: id(),
    recipeId: text('recipe_id')
      .notNull()
      .references(() => recipes.id),
    title: text('title').notNull(),
    citation: text('citation').notNull(),
    url: text('url'),
    note: text('note'),
    createdByPlatformStaffId: text('created_by_platform_staff_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('recipe_source_references_recipe_created_idx').on(table.recipeId, table.createdAt.desc()),
    check('recipe_source_references_title_check', sql`length(trim(${table.title})) > 0`),
    check('recipe_source_references_citation_check', sql`length(trim(${table.citation})) > 0`),
  ],
)

export const recipeCatalogEvents = pgTable(
  'recipe_catalog_events',
  {
    id: id(),
    recipeId: text('recipe_id')
      .notNull()
      .references(() => recipes.id),
    eventType: text('event_type').notNull(),
    actorPlatformStaffId: text('actor_platform_staff_id').notNull(),
    changes: jsonb('changes').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('recipe_catalog_events_recipe_created_idx').on(table.recipeId, table.createdAt.desc()),
    check(
      'recipe_catalog_events_type_check',
      sql`${table.eventType} in ('created', 'updated', 'ingredients_updated', 'reference_added', 'submitted_for_review', 'returned_to_draft', 'published', 'archived')`,
    ),
  ],
)

// Tarifin hesaplanmış besin değeri burada materialized view olarak TUTULMUYOR.
// Bu hesap runtime'da packages/nutrition-core içinde yapılacak (bkz. Hafta 2),
// çünkü verim/pişirme faktörleri değiştikçe view'ı senkron tutmak veritabanı
// katmanında gereksiz karmaşıklık yaratır.

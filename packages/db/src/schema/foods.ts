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
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { id, timestamps } from './_helpers'

export const dataSourceCodeEnum = pgEnum('data_source_code', [
  'BLS4',
  'USDA_FDN',
  'USDA_SR',
  'OGUN',
  'TURKOMP',
  'OFF',
  'CUSTOM',
])

export const nutrientUnitEnum = pgEnum('nutrient_unit', ['g', 'mg', 'µg', 'kcal', 'kJ'])

export const nutrientCategoryEnum = pgEnum('nutrient_category', [
  'makro',
  'vitamin',
  'mineral',
  'yağ_asidi',
  'amino_asit',
  'diğer',
])

export const foodPreparationEnum = pgEnum('food_preparation', [
  'çiğ',
  'haşlanmış',
  'kızartılmış',
  'fırınlanmış',
  'ızgara',
  'buğulama',
])

export const catalogEditorialStatusEnum = pgEnum('catalog_editorial_status', [
  'draft',
  'in_review',
  'published',
  'archived',
])
export type CatalogEditorialStatus = (typeof catalogEditorialStatusEnum.enumValues)[number]

// Bir besin öğesi değerinin nereden geldiğini ve kaynaklar çakıştığında
// hangisinin kazanacağını belirler (priority ne kadar büyükse o kadar öncelikli).
export const dataSources = pgTable('data_sources', {
  id: id(),
  code: dataSourceCodeEnum('code').notNull().unique(),
  name: text('name').notNull(),
  version: text('version'),
  license: text('license'),
  citation: text('citation'),
  priority: integer('priority').notNull(),
  ...timestamps(),
})

// Plan editörü panelinde gösterilecek ~15 "core" besin öğesi dahil, tüm besin öğesi tanımları.
export const nutrients = pgTable('nutrients', {
  id: id(),
  code: text('code').notNull().unique(),
  nameTr: text('name_tr').notNull(),
  nameEn: text('name_en').notNull(),
  unit: nutrientUnitEnum('unit').notNull(),
  category: nutrientCategoryEnum('category').notNull(),
  displayOrder: integer('display_order').notNull().default(0),
  isCore: boolean('is_core').notNull().default(false),
  ...timestamps(),
})

export const foods = pgTable(
  'foods',
  {
    id: id(),
    sourceId: text('source_id')
      .notNull()
      .references(() => dataSources.id),
    sourceCode: text('source_code').notNull(),
    nameTr: text('name_tr').notNull(),
    nameEn: text('name_en'),
    // Aksansız, küçük harfe çevrilmiş, noktalaması temizlenmiş arama alanı.
    // Normalize etme mantığı uygulama katmanında yaşar, burada SQL fonksiyonu yok.
    searchText: text('search_text').notNull(),
    groupCode: text('group_code'),
    groupNameTr: text('group_name_tr'),
    preparation: foodPreparationEnum('preparation'),
    isVerified: boolean('is_verified').notNull().default(false),
    // Imported catalog rows remain published and ETL-owned. Only records explicitly
    // created by the platform editor set isPlatformManaged=true and start as draft.
    isPlatformManaged: boolean('is_platform_managed').notNull().default(false),
    editorialStatus: catalogEditorialStatusEnum('editorial_status').notNull().default('published'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    publishedByPlatformStaffId: text('published_by_platform_staff_id'),
    // BLS gibi kaynaklarda nameTr geçici olarak nameEn ile dolduruluyor;
    // bu bayrak gerçek bir çeviri yapılana kadar true kalır.
    needsTranslation: boolean('needs_translation').notNull().default(false),
    // Kullanıcı tanımlı besinler için clinicId. tenancy şeması kurulana kadar (Prompt 3.1)
    // FK eklenmiyor, sadece serbest metin id.
    createdBy: text('created_by'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('foods_source_id_source_code_idx').on(table.sourceId, table.sourceCode),
    index('foods_search_text_trgm_idx').using('gin', sql`${table.searchText} gin_trgm_ops`),
  ],
)

// Aynı (foodId, nutrientId) çifti için BİRDEN FAZLA kaynaktan değer bulunabilir —
// kaybeden kaynak SİLİNMEZ, sadece isPreferred=false kalır. Hangi satırın aktif
// olduğuna packages/etl/src/lib/merge.ts (data_sources.priority'ye göre) karar verir.
export const foodNutrients = pgTable(
  'food_nutrients',
  {
    foodId: text('food_id')
      .notNull()
      .references(() => foods.id),
    nutrientId: text('nutrient_id')
      .notNull()
      .references(() => nutrients.id),
    sourceId: text('source_id')
      .notNull()
      .references(() => dataSources.id),
    valuePer100g: numeric('value_per_100g', { precision: 12, scale: 4 }).notNull(),
    isImputed: boolean('is_imputed').notNull().default(false),
    isPreferred: boolean('is_preferred').notNull().default(false),
    note: text('note'),
  },
  (table) => [
    primaryKey({ columns: [table.foodId, table.nutrientId, table.sourceId] }),
    index('food_nutrients_nutrient_id_value_idx').on(table.nutrientId, table.valuePer100g),
  ],
)

// BLS ve USDA gibi farklı kaynaklardaki AYNI besini birbirine bağlamak için.
// Otomatik eşleştirme YAPMIYORUZ (kalitesiz eşleşme veriyi bozar) — sadece
// tabloyu ve manuel eşleme fonksiyonlarını hazırlıyoruz (bkz. packages/db/src/queries/food-links.ts).
export const foodLinks = pgTable(
  'food_links',
  {
    id: id(),
    foodIdA: text('food_id_a')
      .notNull()
      .references(() => foods.id),
    foodIdB: text('food_id_b')
      .notNull()
      .references(() => foods.id),
    confidence: numeric('confidence', { precision: 4, scale: 3 }),
    method: text('method').notNull(),
    ...timestamps(),
  },
  (table) => [uniqueIndex('food_links_pair_idx').on(table.foodIdA, table.foodIdB)],
)

export const foodPortions = pgTable(
  'food_portions',
  {
    id: id(),
    foodId: text('food_id')
      .notNull()
      .references(() => foods.id),
    label: text('label').notNull(),
    grams: numeric('grams', { precision: 10, scale: 2 }).notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [
    uniqueIndex('food_portions_one_default_idx')
      .on(table.foodId)
      .where(sql`${table.isDefault} = true`),
    check('food_portions_positive_grams_check', sql`${table.grams} > 0`),
    check('food_portions_nonempty_label_check', sql`length(trim(${table.label})) > 0`),
  ],
)

export const foodSourceReferences = pgTable(
  'food_source_references',
  {
    id: id(),
    foodId: text('food_id')
      .notNull()
      .references(() => foods.id),
    title: text('title').notNull(),
    citation: text('citation').notNull(),
    url: text('url'),
    note: text('note'),
    createdByPlatformStaffId: text('created_by_platform_staff_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('food_source_references_food_created_idx').on(table.foodId, table.createdAt.desc()),
    check('food_source_references_title_check', sql`length(trim(${table.title})) > 0`),
    check('food_source_references_citation_check', sql`length(trim(${table.citation})) > 0`),
  ],
)

export const foodCatalogEvents = pgTable(
  'food_catalog_events',
  {
    id: id(),
    foodId: text('food_id')
      .notNull()
      .references(() => foods.id),
    eventType: text('event_type').notNull(),
    actorPlatformStaffId: text('actor_platform_staff_id').notNull(),
    changes: jsonb('changes').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('food_catalog_events_food_created_idx').on(table.foodId, table.createdAt.desc()),
    check(
      'food_catalog_events_type_check',
      sql`${table.eventType} in ('created', 'general_updated', 'nutrients_updated', 'portions_updated', 'reference_added', 'submitted_for_review', 'returned_to_draft', 'published', 'archived')`,
    ),
  ],
)

// Bileşik yemeklerin kaynakta açıkça verilen malzeme dökümü. Bu tablo tarifin
// besin hesabını yeniden üretmez; plan editörünün alerji/intolerans kontrolünde
// yalnız görünen yemek adına değil gerçek içeriğe de bakabilmesini sağlar.
export const foodIngredients = pgTable(
  'food_ingredients',
  {
    id: id(),
    foodId: text('food_id')
      .notNull()
      .references(() => foods.id),
    nameTr: text('name_tr').notNull(),
    normalizedName: text('normalized_name').notNull(),
    amountGrams: numeric('amount_grams', { precision: 10, scale: 2 }),
    measure: text('measure'),
    sourceLine: text('source_line'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [
    index('food_ingredients_food_id_idx').on(table.foodId),
    index('food_ingredients_normalized_name_idx').on(table.normalizedName),
  ],
)

// Çiğ ağırlıktan pişmiş ağırlığa dönüşüm. foodId doluysa besine özel,
// boşsa groupCode üzerinden genel bir gruba uygulanır.
export const yieldFactors = pgTable('yield_factors', {
  id: id(),
  foodId: text('food_id').references(() => foods.id),
  groupCode: text('group_code'),
  method: text('method').notNull(),
  factor: numeric('factor', { precision: 6, scale: 4 }).notNull(),
})

// Pişirmede besin öğesi kaybı — nutrientId + method başına tutulma oranı.
export const retentionFactors = pgTable('retention_factors', {
  id: id(),
  nutrientId: text('nutrient_id')
    .notNull()
    .references(() => nutrients.id),
  method: text('method').notNull(),
  factor: numeric('factor', { precision: 6, scale: 4 }).notNull(),
})

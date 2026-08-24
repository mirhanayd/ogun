import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
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

export const foodPortions = pgTable('food_portions', {
  id: id(),
  foodId: text('food_id')
    .notNull()
    .references(() => foods.id),
  label: text('label').notNull(),
  grams: numeric('grams', { precision: 10, scale: 2 }).notNull(),
  isDefault: boolean('is_default').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
})

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

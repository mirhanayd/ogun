// Ogun clinical catalog — hastalık/kanser ve ilaç seçimi için normalize edilmiş global referans veri.
//
// Kaynak katmanları:
//   * Human Disease Ontology (DO) — genel hastalık ontolojisi / canonical temel
//   * NCI Thesaurus (NCIt) — özellikle ayrıntılı neoplazm/kanser kavramları
//   * TİTCK Ruhsatlı Beşeri Tıbbi Ürünler + SKRS E-Reçete — Türkiye ilaç kataloğu
//
// ÖNEMLİ: clients.ts içindeki client_health.conditions / medications JSON alanları
// geriye dönük uyumluluk için BİLEREK kaldırılmıyor. Yeni seçimler client_conditions
// ve client_medications tablolarında normalize edilir; query katmanı legacy JSON'u
// da güncel tutabilir.
import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { clients } from './clients'
import { id, timestamps } from './_helpers'

export const clinicalSources = pgTable(
  'clinical_sources',
  {
    // Sabit kodlar doğrudan PK: DO, NCIT, TITCK_RUHSAT, TITCK_SKRS.
    id: text('id').primaryKey(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    version: text('version'),
    license: text('license'),
    citation: text('citation'),
    url: text('url'),
    reuseStatus: text('reuse_status'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    ...timestamps(),
  },
  (table) => [uniqueIndex('clinical_sources_code_idx').on(table.code)],
)

export const conditions = pgTable(
  'conditions',
  {
    // DO paketinde UUIDv5, NCIt-only kayıtlarda ncit:C... — kaynak güncellemelerinde kararlı.
    id: text('id').primaryKey(),
    primarySourceId: text('primary_source_id')
      .notNull()
      .references(() => clinicalSources.id),
    sourceCode: text('source_code').notNull(),
    nameTr: text('name_tr').notNull(),
    nameEn: text('name_en').notNull(),
    definitionEn: text('definition_en'),
    definitionTr: text('definition_tr'),
    semanticType: text('semantic_type'),
    rootCategory: text('root_category'),
    isNeoplasm: boolean('is_neoplasm').notNull().default(false),
    isSupplementalCondition: boolean('is_supplemental_condition').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    // isUiReady=false verinin saklanmaması anlamına GELMEZ; yalnızca Türkçe adın
    // editoryal olarak daha güvenli olup olmadığını UI'ya bildirir.
    isUiReady: boolean('is_ui_ready').notNull().default(false),
    needsReview: boolean('needs_review').notNull().default(true),
    translationStatus: text('translation_status'),
    translationConfidence: doublePrecision('translation_confidence'),
    translationDisplaySource: text('translation_display_source'),
    // Klinik/diyet ilişkisi ontolojiden tahmin edilmez; interaction KB daha sonra kürasyonla doldurur.
    isDietRelevant: boolean('is_diet_relevant'),
    dietRelevanceStatus: text('diet_relevance_status').notNull().default('not_curated'),
    searchText: text('search_text').notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('conditions_source_code_idx').on(table.primarySourceId, table.sourceCode),
    index('conditions_active_name_tr_idx').on(table.isActive, table.nameTr),
    index('conditions_neoplasm_idx').on(table.isNeoplasm, table.isActive),
    index('conditions_ui_ready_idx').on(table.isUiReady, table.needsReview),
  ],
)

export const conditionAliases = pgTable(
  'condition_aliases',
  {
    id: text('id').primaryKey(),
    conditionId: text('condition_id')
      .notNull()
      .references(() => conditions.id, { onDelete: 'cascade' }),
    alias: text('alias').notNull(),
    language: text('language').notNull(),
    aliasType: text('alias_type').notNull(),
    sourceId: text('source_id')
      .notNull()
      .references(() => clinicalSources.id),
    translationStatus: text('translation_status'),
    searchNormalized: text('search_normalized').notNull(),
  },
  (table) => [
    uniqueIndex('condition_aliases_condition_lang_search_idx').on(
      table.conditionId,
      table.language,
      table.searchNormalized,
    ),
    index('condition_aliases_search_idx').on(table.searchNormalized),
  ],
)

// Disease Ontology bir DAG'dir; tek parent_id veri kaybına yol açar.
export const conditionParents = pgTable(
  'condition_parents',
  {
    childConditionId: text('child_condition_id')
      .notNull()
      .references(() => conditions.id, { onDelete: 'cascade' }),
    parentConditionId: text('parent_condition_id')
      .notNull()
      .references(() => conditions.id, { onDelete: 'cascade' }),
    relationType: text('relation_type').notNull().default('is_a'),
    sourceId: text('source_id')
      .notNull()
      .references(() => clinicalSources.id),
    // NCIt filtrelenmiş hiyerarşisinde en yakın korunmuş parent bazen >1 kaynak mesafesindedir.
    sourceDistance: integer('source_distance').notNull().default(1),
  },
  (table) => [
    primaryKey({
      columns: [
        table.childConditionId,
        table.parentConditionId,
        table.relationType,
        table.sourceId,
      ],
    }),
    index('condition_parents_child_idx').on(table.childConditionId),
    index('condition_parents_parent_idx').on(table.parentConditionId),
  ],
)

export const conditionExternalIds = pgTable(
  'condition_external_ids',
  {
    id: text('id').primaryKey(),
    conditionId: text('condition_id')
      .notNull()
      .references(() => conditions.id, { onDelete: 'cascade' }),
    system: text('system').notNull(),
    externalId: text('external_id').notNull(),
    mappingType: text('mapping_type').notNull().default('xref'),
    sourceId: text('source_id')
      .notNull()
      .references(() => clinicalSources.id),
  },
  (table) => [
    uniqueIndex('condition_external_ids_unique_idx').on(
      table.conditionId,
      table.system,
      table.externalId,
    ),
    index('condition_external_ids_lookup_idx').on(table.system, table.externalId),
  ],
)

// Bir NCI kodu DO'da birden fazla hastalığa xref olmuşsa bunu equivalence diye
// sessizce birleştirmiyoruz. Böyle durumlar bu tabloda açıkça "ambiguous" kalır.
export const conditionCrosswalks = pgTable(
  'condition_crosswalks',
  {
    id: text('id').primaryKey(),
    conditionId: text('condition_id')
      .notNull()
      .references(() => conditions.id, { onDelete: 'cascade' }),
    targetSystem: text('target_system').notNull(),
    targetId: text('target_id').notNull(),
    mappingStatus: text('mapping_status').notNull(),
    sourceId: text('source_id')
      .notNull()
      .references(() => clinicalSources.id),
  },
  (table) => [
    uniqueIndex('condition_crosswalks_unique_idx').on(
      table.conditionId,
      table.targetSystem,
      table.targetId,
      table.sourceId,
    ),
  ],
)

export const conditionCategories = pgTable(
  'condition_categories',
  {
    id: text('id').primaryKey(),
    conditionId: text('condition_id')
      .notNull()
      .references(() => conditions.id, { onDelete: 'cascade' }),
    categoryCode: text('category_code').notNull(),
    categoryEn: text('category_en'),
    categoryTr: text('category_tr'),
    sourceId: text('source_id')
      .notNull()
      .references(() => clinicalSources.id),
  },
  (table) => [
    uniqueIndex('condition_categories_unique_idx').on(
      table.conditionId,
      table.sourceId,
      table.categoryCode,
    ),
    index('condition_categories_code_idx').on(table.categoryCode),
  ],
)

export const medicationSubstances = pgTable(
  'medication_substances',
  {
    // İlk sürümde TİTCK ETKİN MADDE alanının normalize edilmiş TAM ifadesi canonical'dır.
    // Kombinasyonlar otomatik parçalanmaz; yanlış farmakolojik eşleme yapmamak için review flag'i kullanılır.
    id: text('id').primaryKey(),
    nameTr: text('name_tr').notNull(),
    normalizedName: text('normalized_name').notNull(),
    isCombination: boolean('is_combination').notNull().default(false),
    needsReview: boolean('needs_review').notNull().default(false),
    searchText: text('search_text').notNull(),
    sourceId: text('source_id')
      .notNull()
      .references(() => clinicalSources.id),
    mappingMethod: text('mapping_method').notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('medication_substances_normalized_name_idx').on(table.normalizedName),
    index('medication_substances_name_tr_idx').on(table.nameTr),
  ],
)

export const medicationSubstanceAliases = pgTable(
  'medication_substance_aliases',
  {
    id: text('id').primaryKey(),
    medicationSubstanceId: text('medication_substance_id')
      .notNull()
      .references(() => medicationSubstances.id, { onDelete: 'cascade' }),
    alias: text('alias').notNull(),
    aliasType: text('alias_type').notNull(),
    sourceId: text('source_id')
      .notNull()
      .references(() => clinicalSources.id),
    searchNormalized: text('search_normalized').notNull(),
  },
  (table) => [
    uniqueIndex('medication_substance_alias_unique_idx').on(
      table.medicationSubstanceId,
      table.searchNormalized,
      table.sourceId,
    ),
  ],
)

export const medicationProducts = pgTable(
  'medication_products',
  {
    // Barkod tek başına UNIQUE DEĞİL: 21.08.2026 resmi TİTCK dosyasında gerçek barkod çakışmaları var.
    id: text('id').primaryKey(),
    productType: text('product_type').notNull(),
    name: text('name').notNull(),
    barcode: text('barcode'),
    companyName: text('company_name'),
    activeIngredientRaw: text('active_ingredient_raw'),
    atcCode: text('atc_code'),
    atcName: text('atc_name'),
    licenseDate: date('license_date', { mode: 'string' }),
    licenseNumber: text('license_number'),
    permitDate: date('permit_date', { mode: 'string' }),
    permitNumber: text('permit_number'),
    suspensionCode: text('suspension_code'),
    suspensionDate: date('suspension_date', { mode: 'string' }),
    prescriptionType: text('prescription_type'),
    erxStatus: text('erx_status'),
    erxDescription: text('erx_description'),
    erxListedDate: date('erx_listed_date', { mode: 'string' }),
    isSelectable: boolean('is_selectable').notNull().default(true),
    searchText: text('search_text').notNull(),
    sourceId: text('source_id')
      .notNull()
      .references(() => clinicalSources.id),
    sourceRow: integer('source_row'),
    ...timestamps(),
  },
  (table) => [
    index('medication_products_barcode_idx').on(table.barcode),
    index('medication_products_selectable_name_idx').on(table.isSelectable, table.name),
    index('medication_products_atc_idx').on(table.atcCode),
  ],
)

export const medicationProductAliases = pgTable(
  'medication_product_aliases',
  {
    id: text('id').primaryKey(),
    medicationProductId: text('medication_product_id')
      .notNull()
      .references(() => medicationProducts.id, { onDelete: 'cascade' }),
    alias: text('alias').notNull(),
    aliasType: text('alias_type').notNull(),
    sourceId: text('source_id')
      .notNull()
      .references(() => clinicalSources.id),
    searchNormalized: text('search_normalized').notNull(),
  },
  (table) => [
    uniqueIndex('medication_product_alias_unique_idx').on(
      table.medicationProductId,
      table.searchNormalized,
      table.sourceId,
    ),
  ],
)

export const medicationProductSubstances = pgTable(
  'medication_product_substances',
  {
    medicationProductId: text('medication_product_id').notNull(),
    medicationSubstanceId: text('medication_substance_id').notNull(),
    relationType: text('relation_type').notNull(),
    sourceId: text('source_id')
      .notNull()
      .references(() => clinicalSources.id),
  },
  (table) => [
    foreignKey({
      name: 'med_product_substances_product_fk',
      columns: [table.medicationProductId],
      foreignColumns: [medicationProducts.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'med_product_substances_substance_fk',
      columns: [table.medicationSubstanceId],
      foreignColumns: [medicationSubstances.id],
    }).onDelete('cascade'),
    primaryKey({
      columns: [table.medicationProductId, table.medicationSubstanceId, table.relationType],
    }),
    index('medication_product_substances_substance_idx').on(table.medicationSubstanceId),
  ],
)

export const clientConditions = pgTable(
  'client_conditions',
  {
    id: id(),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    conditionId: text('condition_id')
      .notNull()
      .references(() => conditions.id),
    status: text('status').notNull().default('active'),
    diagnosedAt: date('diagnosed_at', { mode: 'string' }),
    note: text('note'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('client_conditions_client_condition_idx').on(table.clientId, table.conditionId),
    index('client_conditions_condition_idx').on(table.conditionId),
  ],
)

export const clientMedications = pgTable(
  'client_medications',
  {
    id: id(),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    medicationProductId: text('medication_product_id').references(() => medicationProducts.id),
    medicationSubstanceId: text('medication_substance_id').references(
      () => medicationSubstances.id,
    ),
    // Katalogda bulunmayan çok yeni/özel ürün için kontrollü kaçış yolu; normal akış katalog seçimidir.
    customName: text('custom_name'),
    dose: text('dose'),
    doseUnit: text('dose_unit'),
    frequency: text('frequency'),
    route: text('route'),
    startedAt: date('started_at', { mode: 'string' }),
    endedAt: date('ended_at', { mode: 'string' }),
    isActive: boolean('is_active').notNull().default(true),
    note: text('note'),
    ...timestamps(),
  },
  (table) => [
    check(
      'client_medications_selection_check',
      sql`${table.medicationProductId} is not null or ${table.medicationSubstanceId} is not null or ${table.customName} is not null`,
    ),
    index('client_medications_client_active_idx').on(table.clientId, table.isActive),
    index('client_medications_product_idx').on(table.medicationProductId),
    index('client_medications_substance_idx').on(table.medicationSubstanceId),
  ],
)

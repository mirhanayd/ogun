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
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { clients } from './clients'
import { nutrients } from './foods'
import { users } from './tenancy'
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

// RxNorm adayları yalnız küçük crosswalk metadata'sı olarak tutulur. Raw RRF,
// candidate JSONL ve review worklist PostgreSQL'e girmez. Klinik tüketiciler
// yalnız mapping_status='verified' kayıtlarını kullanmalıdır.
export const medicationSubstanceMappings = pgTable(
  'medication_substance_mappings',
  {
    id: text('id').primaryKey(),
    medicationSubstanceId: text('medication_substance_id')
      .notNull()
      .references(() => medicationSubstances.id, { onDelete: 'cascade' }),
    system: text('system').notNull().default('RXNORM'),
    externalId: text('external_id').notNull(),
    mappingStatus: text('mapping_status').notNull().default('candidate'),
    matchMethod: text('match_method').notNull(),
    confidence: doublePrecision('confidence'),
    matchedTerm: text('matched_term'),
    externalTermType: text('external_term_type'),
    sourceVersion: text('source_version').notNull(),
    reviewedBy: text('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    // Deterministik doğrulama insan incelemesi gibi sunulmaz. reviewedBy karar
    // aktörünü (insan veya sistem), bu alanlar ise doğrulamanın provenance'ını tutar.
    verificationMethod: text('verification_method'),
    verificationReason: text('verification_reason'),
    verificationVersion: text('verification_version'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('medication_substance_mappings_unique_idx').on(
      table.medicationSubstanceId,
      table.system,
      table.externalId,
    ),
    index('medication_substance_mappings_external_idx').on(table.system, table.externalId),
    index('medication_substance_mappings_status_idx').on(table.mappingStatus),
    check('medication_substance_mappings_system_check', sql`${table.system} in ('RXNORM')`),
    check(
      'medication_substance_mappings_status_check',
      sql`${table.mappingStatus} in ('candidate', 'reviewed', 'verified', 'ambiguous', 'rejected', 'unmapped')`,
    ),
    check(
      'medication_substance_mappings_method_check',
      sql`${table.matchMethod} in ('lexical_exact', 'normalized_exact', 'token_exact', 'atc_bridge', 'fuzzy', 'manual')`,
    ),
    check(
      'medication_substance_mappings_confidence_check',
      sql`${table.confidence} is null or (${table.confidence} >= 0 and ${table.confidence} <= 1)`,
    ),
    check(
      'medication_substance_mappings_review_check',
      sql`${table.mappingStatus} not in ('reviewed', 'verified') or (${table.reviewedBy} is not null and ${table.reviewedAt} is not null)`,
    ),
    check(
      'medication_substance_mappings_verification_check',
      sql`(
        ${table.verificationMethod} is null
        or ${table.verificationMethod} in ('deterministic_exact_v1', 'human_review', 'manual_override')
      ) and (
        ${table.mappingStatus} <> 'verified'
        or (
          ${table.verificationMethod} is not null
          and ${table.verificationReason} is not null
          and ${table.verificationVersion} is not null
        )
      )`,
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

// Klinik interaction hedefleri mümkün olduğunda doğrudan nutrients FK'sini kullanır.
// Besin kataloğunda doğal karşılığı olmayan grapefruit, alcohol ve meal timing gibi
// kontrollü kavramlar yalnız bu küçük sözlükte tutulur; foods/nutrients kopyalanmaz.
export const clinicalTargetConcepts = pgTable(
  'clinical_target_concepts',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    key: text('key').notNull(),
    nameTr: text('name_tr').notNull(),
    nameEn: text('name_en').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('clinical_target_concepts_type_key_idx').on(table.type, table.key),
    check(
      'clinical_target_concepts_type_check',
      sql`${table.type} in ('food_component', 'food', 'food_group', 'supplement', 'alcohol', 'meal_timing')`,
    ),
  ],
)

export const clinicalInteractions = pgTable(
  'clinical_interactions',
  {
    id: text('id').primaryKey(),
    medicationSubstanceId: text('medication_substance_id').references(
      () => medicationSubstances.id,
    ),
    conditionId: text('condition_id').references(() => conditions.id),
    targetType: text('target_type').notNull(),
    nutrientId: text('nutrient_id').references(() => nutrients.id),
    clinicalTargetConceptId: text('clinical_target_concept_id').references(
      () => clinicalTargetConcepts.id,
    ),
    action: text('action').notNull(),
    severity: text('severity').notNull(),
    evidenceStrength: text('evidence_strength').notNull(),
    timingBeforeMinutes: integer('timing_before_minutes'),
    timingAfterMinutes: integer('timing_after_minutes'),
    titleTr: text('title_tr'),
    clinicalEffectTr: text('clinical_effect_tr'),
    mechanismTr: text('mechanism_tr'),
    recommendationTr: text('recommendation_tr'),
    status: text('status').notNull().default('draft'),
    reviewStatus: text('review_status').notNull().default('pending'),
    reviewedBy: text('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    sourceCandidateId: text('source_candidate_id').notNull(),
    sourceCandidateSemanticHash: text('source_candidate_semantic_hash').notNull(),
    version: integer('version').notNull().default(1),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('clinical_interactions_source_candidate_idx').on(table.sourceCandidateId),
    index('clinical_interactions_medication_status_idx').on(
      table.medicationSubstanceId,
      table.status,
      table.reviewStatus,
    ),
    index('clinical_interactions_condition_status_idx').on(
      table.conditionId,
      table.status,
      table.reviewStatus,
    ),
    index('clinical_interactions_nutrient_idx').on(table.nutrientId),
    index('clinical_interactions_target_concept_idx').on(table.clinicalTargetConceptId),
    index('clinical_interactions_status_action_idx').on(table.status, table.action),
    check(
      'clinical_interactions_subject_check',
      sql`num_nonnulls(${table.medicationSubstanceId}, ${table.conditionId}) = 1`,
    ),
    check(
      'clinical_interactions_target_check',
      sql`(
        ${table.nutrientId} is not null
        and ${table.clinicalTargetConceptId} is null
        and ${table.targetType} in ('nutrient', 'food_component')
      ) or (
        ${table.nutrientId} is null
        and ${table.clinicalTargetConceptId} is not null
        and ${table.targetType} <> 'nutrient'
      )`,
    ),
    check(
      'clinical_interactions_target_type_check',
      sql`${table.targetType} in ('nutrient', 'food_component', 'food', 'food_group', 'supplement', 'alcohol', 'meal_timing')`,
    ),
    check(
      'clinical_interactions_action_check',
      sql`${table.action} in ('avoid', 'limit', 'caution', 'monitor', 'consistency', 'separate_timing', 'take_with_food', 'take_without_food', 'avoid_alcohol', 'individualize')`,
    ),
    check(
      'clinical_interactions_severity_check',
      sql`${table.severity} in ('info', 'low', 'moderate', 'high', 'critical')`,
    ),
    check(
      'clinical_interactions_evidence_strength_check',
      sql`${table.evidenceStrength} in ('strong', 'moderate', 'limited', 'expert_consensus', 'unknown')`,
    ),
    check(
      'clinical_interactions_status_check',
      sql`${table.status} in ('draft', 'published', 'superseded', 'retired')`,
    ),
    check(
      'clinical_interactions_review_status_check',
      sql`${table.reviewStatus} in ('pending', 'approved', 'rejected', 'needs_more_evidence')`,
    ),
    check(
      'clinical_interactions_review_actor_check',
      sql`${table.reviewedBy} is null or lower(trim(${table.reviewedBy})) not in ('ai', 'agent', 'system')`,
    ),
    check(
      'clinical_interactions_publish_check',
      sql`${table.status} <> 'published' or (
        ${table.reviewStatus} = 'approved'
        and ${table.reviewedBy} is not null
        and ${table.reviewedAt} is not null
      )`,
    ),
    check(
      'clinical_interactions_timing_check',
      sql`(${table.timingBeforeMinutes} is null or ${table.timingBeforeMinutes} >= 0)
        and (${table.timingAfterMinutes} is null or ${table.timingAfterMinutes} >= 0)`,
    ),
    check('clinical_interactions_version_check', sql`${table.version} >= 1`),
  ],
)

// Yalnız yayınlanmış kurala seçilerek bağlanan kısa provenance tutulur. Raw SPL
// metni ve candidate evidence JSONL filesystem'de kalır.
export const clinicalInteractionEvidence = pgTable(
  'clinical_interaction_evidence',
  {
    id: text('id').primaryKey(),
    interactionId: text('interaction_id')
      .notNull()
      .references(() => clinicalInteractions.id, { onDelete: 'cascade' }),
    sourceId: text('source_id')
      .notNull()
      .references(() => clinicalSources.id),
    sourceDocumentId: text('source_document_id').notNull(),
    sourceVersion: text('source_version'),
    sourceSection: text('source_section').notNull(),
    sourceLocator: text('source_locator').notNull(),
    evidenceSummary: text('evidence_summary'),
    sourceHash: text('source_hash').notNull(),
    retrievedAt: timestamp('retrieved_at', { withTimezone: true }).notNull(),
    evidenceStrength: text('evidence_strength').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('clinical_interaction_evidence_provenance_idx').on(
      table.interactionId,
      table.sourceId,
      table.sourceDocumentId,
      table.sourceHash,
    ),
    index('clinical_interaction_evidence_interaction_idx').on(table.interactionId),
    check(
      'clinical_interaction_evidence_strength_check',
      sql`${table.evidenceStrength} in ('strong', 'moderate', 'limited', 'expert_consensus', 'unknown')`,
    ),
  ],
)

// ---------------------------------------------------------------------------
// Clinical Review Portal Tables
// ---------------------------------------------------------------------------

export const clinicalReviewerProfiles = pgTable(
  'clinical_reviewer_profiles',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    professionalRole: text('professional_role').notNull(),
    specialty: text('specialty'),
    verificationStatus: text('verification_status').notNull().default('pending'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    verifiedBy: text('verified_by').references(() => users.id),
    isActive: boolean('is_active').notNull().default(true),
    canPublish: boolean('can_publish').notNull().default(false),
    ...timestamps(),
  },
  (table) => [
    index('clinical_reviewer_role_status_idx').on(
      table.professionalRole,
      table.verificationStatus,
      table.isActive,
    ),
    index('clinical_reviewer_status_idx').on(table.verificationStatus),
    check(
      'clinical_reviewer_role_check',
      sql`${table.professionalRole} in ('pharmacist', 'dietitian', 'physician', 'clinical_admin')`,
    ),
    check(
      'clinical_reviewer_status_check',
      sql`${table.verificationStatus} in ('pending', 'verified', 'suspended', 'rejected')`,
    ),
  ],
)

export const clinicalReviewerCapabilities = pgTable(
  'clinical_reviewer_capabilities',
  {
    reviewerUserId: text('reviewer_user_id')
      .notNull()
      .references(() => clinicalReviewerProfiles.userId, { onDelete: 'cascade' }),
    capability: text('capability').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.reviewerUserId, table.capability] }),
    index('clinical_reviewer_capabilities_cap_idx').on(table.capability),
    check(
      'clinical_reviewer_capability_check',
      sql`${table.capability} in ('medication_food', 'medication_supplement', 'medication_timing', 'condition_nutrient', 'condition_food', 'oncology_medication', 'renal_nutrition', 'general_clinical')`,
    ),
  ],
)

export const clinicalReviewTasks = pgTable(
  'clinical_review_tasks',
  {
    id: text('id').primaryKey(),
    sourceSystem: text('source_system').notNull().default('openfda'),
    candidateId: text('candidate_id').notNull(),
    candidateSemanticHash: text('candidate_semantic_hash').notNull(),
    subjectType: text('subject_type').notNull(),
    medicationSubstanceId: text('medication_substance_id').references(
      () => medicationSubstances.id,
    ),
    conditionId: text('condition_id').references(() => conditions.id),
    targetType: text('target_type').notNull(),
    targetKey: text('target_key').notNull(),
    action: text('action').notNull(),
    candidateConfidence: text('candidate_confidence').notNull(),
    ingredientAttribution: text('ingredient_attribution'),
    reviewPriority: text('review_priority').notNull(),
    requiredCapability: text('required_capability').notNull(),
    status: text('status').notNull().default('pending'),
    artifactLocator: text('artifact_locator').notNull(),
    evidenceCount: integer('evidence_count').notNull().default(0),
    sourceDocumentCount: integer('source_document_count').notNull().default(0),
    version: integer('version').notNull().default(1),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('clinical_review_tasks_candidate_idx').on(table.candidateId),
    index('clinical_review_tasks_status_priority_idx').on(table.status, table.reviewPriority),
    index('clinical_review_tasks_cap_status_idx').on(table.requiredCapability, table.status),
    index('clinical_review_tasks_med_status_idx').on(table.medicationSubstanceId, table.status),
    index('clinical_review_tasks_cond_status_idx').on(table.conditionId, table.status),
    index('clinical_review_tasks_semantic_hash_idx').on(table.candidateSemanticHash),
    check(
      'clinical_review_tasks_subject_check',
      sql`num_nonnulls(${table.medicationSubstanceId}, ${table.conditionId}) = 1`,
    ),
    check(
      'clinical_review_tasks_subject_type_check',
      sql`${table.subjectType} in ('medication', 'condition')`,
    ),
    check(
      'clinical_review_tasks_status_check',
      sql`${table.status} in ('pending', 'assigned', 'in_review', 'needs_more_evidence', 'approved', 'rejected', 'deferred', 'ready_to_publish', 'published', 'source_changed')`,
    ),
    check(
      'clinical_review_tasks_priority_check',
      sql`${table.reviewPriority} in ('P1', 'P2', 'P3', 'P4', 'P5')`,
    ),
    check(
      'clinical_review_tasks_confidence_check',
      sql`${table.candidateConfidence} in ('high', 'medium', 'low')`,
    ),
    check(
      'clinical_review_tasks_target_type_check',
      sql`${table.targetType} in ('nutrient', 'food_component', 'food', 'food_group', 'supplement', 'alcohol', 'meal_timing')`,
    ),
    check(
      'clinical_review_tasks_action_check',
      sql`${table.action} in ('avoid', 'limit', 'caution', 'monitor', 'consistency', 'separate_timing', 'take_with_food', 'take_without_food', 'avoid_alcohol', 'individualize')`,
    ),
    check('clinical_review_tasks_version_check', sql`${table.version} >= 1`),
  ],
)

export const clinicalReviewAssignments = pgTable(
  'clinical_review_assignments',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => clinicalReviewTasks.id, { onDelete: 'cascade' }),
    reviewerUserId: text('reviewer_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    assignmentRole: text('assignment_role').notNull(),
    status: text('status').notNull().default('assigned'),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
    assignedBy: text('assigned_by').references(() => users.id),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('clinical_review_assignments_task_user_idx').on(
      table.taskId,
      table.reviewerUserId,
    ),
    index('clinical_review_assignments_user_status_idx').on(
      table.reviewerUserId,
      table.status,
    ),
    index('clinical_review_assignments_task_status_idx').on(table.taskId, table.status),
    check(
      'clinical_review_assignments_role_check',
      sql`${table.assignmentRole} in ('primary', 'secondary', 'co_review')`,
    ),
    check(
      'clinical_review_assignments_status_check',
      sql`${table.status} in ('assigned', 'in_progress', 'completed', 'cancelled')`,
    ),
  ],
)

export const clinicalReviewDecisions = pgTable(
  'clinical_review_decisions',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => clinicalReviewTasks.id, { onDelete: 'cascade' }),
    reviewerUserId: text('reviewer_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    decision: text('decision').notNull(),
    severity: text('severity'),
    evidenceStrength: text('evidence_strength'),
    approvedTargetKey: text('approved_target_key'),
    approvedAction: text('approved_action'),
    titleTr: text('title_tr'),
    clinicalEffectTr: text('clinical_effect_tr'),
    mechanismTr: text('mechanism_tr'),
    recommendationTr: text('recommendation_tr'),
    attributionConfirmed: boolean('attribution_confirmed'),
    rejectReason: text('reject_reason'),
    reviewNote: text('review_note'),
    candidateSemanticHash: text('candidate_semantic_hash').notNull(),
    isDraft: boolean('is_draft').notNull().default(false),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('clinical_review_decisions_task_user_draft_idx').on(
      table.taskId,
      table.reviewerUserId,
      table.isDraft,
    ),
    index('clinical_review_decisions_task_idx').on(table.taskId),
    index('clinical_review_decisions_reviewer_idx').on(table.reviewerUserId),
    index('clinical_review_decisions_decision_idx').on(table.decision),
    check(
      'clinical_review_decisions_decision_check',
      sql`${table.decision} in ('approve', 'reject', 'defer', 'needs_more_evidence')`,
    ),
    check(
      'clinical_review_decisions_severity_check',
      sql`${table.severity} is null or ${table.severity} in ('info', 'low', 'moderate', 'high', 'critical')`,
    ),
    check(
      'clinical_review_decisions_evidence_strength_check',
      sql`${table.evidenceStrength} is null or ${table.evidenceStrength} in ('strong', 'moderate', 'limited', 'expert_consensus', 'unknown')`,
    ),
    check(
      'clinical_review_decisions_action_check',
      sql`${table.approvedAction} is null or ${table.approvedAction} in ('avoid', 'limit', 'caution', 'monitor', 'consistency', 'separate_timing', 'take_with_food', 'take_without_food', 'avoid_alcohol', 'individualize')`,
    ),
    check(
      'clinical_review_decisions_reject_reason_check',
      sql`${table.rejectReason} is null or ${table.rejectReason} in ('false_positive', 'wrong_subject', 'wrong_target', 'wrong_action', 'non_clinical_instruction', 'duplicate', 'source_problem', 'other')`,
    ),
  ],
)

export const clinicalReviewAuditLog = pgTable(
  'clinical_review_audit_log',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id').references(() => clinicalReviewTasks.id, {
      onDelete: 'set null',
    }),
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'no action' }),
    eventType: text('event_type').notNull(),
    fromStatus: text('from_status'),
    toStatus: text('to_status'),
    compactChangeSummary: text('compact_change_summary').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('clinical_review_audit_log_task_idx').on(table.taskId),
    index('clinical_review_audit_log_actor_idx').on(table.actorUserId),
    index('clinical_review_audit_log_created_idx').on(table.createdAt),
    check(
      'clinical_review_audit_log_event_type_check',
      sql`${table.eventType} in ('task_created', 'task_assigned', 'review_started', 'decision_saved', 'decision_changed', 'needs_evidence', 'approval_completed', 'source_changed', 'ready_to_publish', 'published', 'reviewer_verified', 'reviewer_suspended')`,
    ),
  ],
)


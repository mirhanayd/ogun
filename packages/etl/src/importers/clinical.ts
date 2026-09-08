import { createReadStream, existsSync, readFileSync } from 'node:fs'
import { createGunzip } from 'node:zlib'
import path from 'node:path'
import readline from 'node:readline'
import { sql } from 'drizzle-orm'
import {
  clinicalSources,
  conditionAliases,
  conditionCategories,
  conditionCrosswalks,
  conditionExternalIds,
  conditionParents,
  conditions,
  medicationProductAliases,
  medicationProducts,
  medicationProductSubstances,
  medicationSubstanceAliases,
  medicationSubstances,
} from '@ogun/db/schema'

const REQUIRED = [
  'manifest.json',
  'sources.json',
  'conditions.jsonl.gz',
  'condition_aliases.jsonl.gz',
  'condition_parents.jsonl.gz',
  'condition_external_ids.jsonl.gz',
  'condition_crosswalks.jsonl.gz',
  'condition_categories.jsonl.gz',
  'medication_products.jsonl.gz',
  'medication_product_aliases.jsonl.gz',
  'medication_substances.jsonl.gz',
  'medication_substance_aliases.jsonl.gz',
  'medication_product_substances.jsonl.gz',
]

function resolveDataDir() {
  const arg = process.argv.slice(2).find((x) => x.startsWith('--dir='))
  return arg ? path.resolve(arg.slice('--dir='.length)) : path.resolve(process.cwd(), 'data/clinical/processed')
}

async function* readJsonlGzip<T>(filePath: string): AsyncGenerator<T> {
  const stream = createReadStream(filePath).pipe(createGunzip())
  const lines = readline.createInterface({ input: stream, crlfDelay: Infinity })
  for await (const line of lines) {
    const trimmed = line.trim()
    if (trimmed) yield JSON.parse(trimmed) as T
  }
}

async function inBatches<T>(filePath: string, batchSize: number, work: (rows: T[]) => Promise<void>) {
  let batch: T[] = []
  let count = 0
  for await (const row of readJsonlGzip<T>(filePath)) {
    batch.push(row)
    if (batch.length >= batchSize) {
      await work(batch)
      count += batch.length
      batch = []
      if (count % 10_000 === 0) console.log(`... ${path.basename(filePath)}: ${count.toLocaleString('tr-TR')}`)
    }
  }
  if (batch.length) {
    await work(batch)
    count += batch.length
  }
  return count
}

type SourceRow = {
  id: string
  code: string
  name: string
  version?: string | null
  license?: string | null
  citation?: string | null
  url?: string | null
  reuseStatus?: string | null
}

type ConditionRow = Record<string, unknown> & {
  id: string
  primarySource: string
  sourceCode: string
  nameTr: string
  nameEn: string
  searchText: string
}

type MedicationSubstanceRow = Record<string, unknown> & {
  id: string
  nameTr: string
  normalizedName: string
  source: string
}

type MedicationProductRow = Record<string, unknown> & {
  id: string
  name: string
  source: string
}

function sourceIdFromMappingMethod(value: string) {
  return value.startsWith('TITCK_SKRS') ? 'TITCK_SKRS' : 'TITCK_RUHSAT'
}

async function main() {
  const dir = resolveDataDir()
  const missing = REQUIRED.filter((name) => !existsSync(path.join(dir, name)))
  if (missing.length) {
    throw new Error(`Clinical ETL dosyaları eksik: ${missing.join(', ')}\nBeklenen klasör: ${dir}`)
  }
  const manifest = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as {
    counts?: Record<string, number>
  }
  console.log('Ogun clinical catalog içe aktarılıyor:', manifest.counts ?? {})

  const { db } = await import('@ogun/db')
  try {
    const sourceRows = JSON.parse(readFileSync(path.join(dir, 'sources.json'), 'utf8')) as SourceRow[]
    for (const row of sourceRows) {
      await db
        .insert(clinicalSources)
        .values({
          id: row.id,
          code: row.code,
          name: row.name,
          version: row.version ?? null,
          license: row.license ?? null,
          citation: row.citation ?? null,
          url: row.url ?? null,
          reuseStatus: row.reuseStatus ?? null,
          metadata: row,
        })
        .onConflictDoUpdate({
          target: clinicalSources.id,
          set: {
            code: row.code,
            name: row.name,
            version: row.version ?? null,
            license: row.license ?? null,
            citation: row.citation ?? null,
            url: row.url ?? null,
            reuseStatus: row.reuseStatus ?? null,
            metadata: row,
          },
          setWhere: sql`(
            ${clinicalSources.code},
            ${clinicalSources.name},
            ${clinicalSources.version},
            ${clinicalSources.license},
            ${clinicalSources.citation},
            ${clinicalSources.url},
            ${clinicalSources.reuseStatus},
            ${clinicalSources.metadata}
          ) is distinct from (
            excluded.code,
            excluded.name,
            excluded.version,
            excluded.license,
            excluded.citation,
            excluded.url,
            excluded.reuse_status,
            excluded.metadata
          )`,
        })
    }

    const conditionCount = await inBatches<ConditionRow>(path.join(dir, 'conditions.jsonl.gz'), 500, async (rows) => {
      await db
        .insert(conditions)
        .values(
          rows.map((r) => ({
            id: r.id,
            primarySourceId: r.primarySource,
            sourceCode: r.sourceCode,
            nameTr: r.nameTr,
            nameEn: r.nameEn,
            definitionEn: (r.definitionEn as string | null) ?? null,
            definitionTr: (r.definitionTr as string | null) ?? null,
            semanticType: (r.semanticType as string | null) ?? null,
            rootCategory: (r.rootCategory as string | null) ?? null,
            isNeoplasm: Boolean(r.isNeoplasm),
            isSupplementalCondition: Boolean(r.isSupplementalCondition),
            isActive: Boolean(r.isActive),
            isUiReady: Boolean(r.isUiReady),
            needsReview: Boolean(r.needsReview),
            translationStatus: (r.translationStatus as string | null) ?? null,
            translationConfidence: (r.translationConfidence as number | null) ?? null,
            translationDisplaySource: (r.translationDisplaySource as string | null) ?? null,
            isDietRelevant: (r.isDietRelevant as boolean | null) ?? null,
            dietRelevanceStatus: (r.dietRelevanceStatus as string) ?? 'not_curated',
            searchText: r.searchText,
          })),
        )
        .onConflictDoUpdate({
          target: conditions.id,
          set: {
            primarySourceId: sql`excluded.primary_source_id`,
            sourceCode: sql`excluded.source_code`,
            nameTr: sql`excluded.name_tr`,
            nameEn: sql`excluded.name_en`,
            definitionEn: sql`excluded.definition_en`,
            definitionTr: sql`excluded.definition_tr`,
            semanticType: sql`excluded.semantic_type`,
            rootCategory: sql`excluded.root_category`,
            isNeoplasm: sql`excluded.is_neoplasm`,
            isSupplementalCondition: sql`excluded.is_supplemental_condition`,
            isActive: sql`excluded.is_active`,
            isUiReady: sql`excluded.is_ui_ready`,
            needsReview: sql`excluded.needs_review`,
            translationStatus: sql`excluded.translation_status`,
            translationConfidence: sql`excluded.translation_confidence`,
            translationDisplaySource: sql`excluded.translation_display_source`,
            isDietRelevant: sql`excluded.is_diet_relevant`,
            dietRelevanceStatus: sql`excluded.diet_relevance_status`,
            searchText: sql`excluded.search_text`,
          },
          setWhere: sql`(
            ${conditions.primarySourceId},
            ${conditions.sourceCode},
            ${conditions.nameTr},
            ${conditions.nameEn},
            ${conditions.definitionEn},
            ${conditions.definitionTr},
            ${conditions.semanticType},
            ${conditions.rootCategory},
            ${conditions.isNeoplasm},
            ${conditions.isSupplementalCondition},
            ${conditions.isActive},
            ${conditions.isUiReady},
            ${conditions.needsReview},
            ${conditions.translationStatus},
            ${conditions.translationConfidence},
            ${conditions.translationDisplaySource},
            ${conditions.isDietRelevant},
            ${conditions.dietRelevanceStatus},
            ${conditions.searchText}
          ) is distinct from (
            excluded.primary_source_id,
            excluded.source_code,
            excluded.name_tr,
            excluded.name_en,
            excluded.definition_en,
            excluded.definition_tr,
            excluded.semantic_type,
            excluded.root_category,
            excluded.is_neoplasm,
            excluded.is_supplemental_condition,
            excluded.is_active,
            excluded.is_ui_ready,
            excluded.needs_review,
            excluded.translation_status,
            excluded.translation_confidence,
            excluded.translation_display_source,
            excluded.is_diet_relevant,
            excluded.diet_relevance_status,
            excluded.search_text
          )`,
        })
    })

    const substanceCount = await inBatches<MedicationSubstanceRow>(
      path.join(dir, 'medication_substances.jsonl.gz'),
      500,
      async (rows) => {
        await db
          .insert(medicationSubstances)
          .values(
            rows.map((r) => ({
              id: r.id,
              nameTr: r.nameTr,
              normalizedName: r.normalizedName,
              isCombination: Boolean(r.isCombination),
              needsReview: Boolean(r.needsReview),
              searchText: String(r.searchText),
              sourceId: sourceIdFromMappingMethod(r.source),
              mappingMethod: r.source,
            })),
          )
          .onConflictDoUpdate({
            target: medicationSubstances.id,
            set: {
              nameTr: sql`excluded.name_tr`,
              normalizedName: sql`excluded.normalized_name`,
              isCombination: sql`excluded.is_combination`,
              needsReview: sql`excluded.needs_review`,
              searchText: sql`excluded.search_text`,
              sourceId: sql`excluded.source_id`,
              mappingMethod: sql`excluded.mapping_method`,
            },
            setWhere: sql`(
              ${medicationSubstances.nameTr},
              ${medicationSubstances.normalizedName},
              ${medicationSubstances.isCombination},
              ${medicationSubstances.needsReview},
              ${medicationSubstances.searchText},
              ${medicationSubstances.sourceId},
              ${medicationSubstances.mappingMethod}
            ) is distinct from (
              excluded.name_tr,
              excluded.normalized_name,
              excluded.is_combination,
              excluded.needs_review,
              excluded.search_text,
              excluded.source_id,
              excluded.mapping_method
            )`,
          })
      },
    )

    const productCount = await inBatches<MedicationProductRow>(
      path.join(dir, 'medication_products.jsonl.gz'),
      300,
      async (rows) => {
        await db
          .insert(medicationProducts)
          .values(
            rows.map((r) => ({
              id: r.id,
              productType: String(r.productType),
              name: r.name,
              barcode: (r.barcode as string | null) ?? null,
              companyName: (r.companyName as string | null) ?? null,
              activeIngredientRaw: (r.activeIngredientRaw as string | null) ?? null,
              atcCode: (r.atcCode as string | null) ?? null,
              atcName: (r.atcName as string | null) ?? null,
              licenseDate: (r.licenseDate as string | null) ?? null,
              licenseNumber: (r.licenseNumber as string | null) ?? null,
              permitDate: (r.permitDate as string | null) ?? null,
              permitNumber: (r.permitNumber as string | null) ?? null,
              suspensionCode: (r.suspensionCode as string | null) ?? null,
              suspensionDate: (r.suspensionDate as string | null) ?? null,
              prescriptionType: (r.prescriptionType as string | null) ?? null,
              erxStatus: (r.erxStatus as string | null) ?? null,
              erxDescription: (r.erxDescription as string | null) ?? null,
              erxListedDate: (r.erxListedDate as string | null) ?? null,
              isSelectable: Boolean(r.isSelectable),
              searchText: String(r.searchText),
              sourceId: r.source,
              sourceRow: (r.sourceRow as number | null) ?? null,
            })),
          )
          .onConflictDoUpdate({
            target: medicationProducts.id,
            set: {
              productType: sql`excluded.product_type`,
              name: sql`excluded.name`,
              barcode: sql`excluded.barcode`,
              companyName: sql`excluded.company_name`,
              activeIngredientRaw: sql`excluded.active_ingredient_raw`,
              atcCode: sql`excluded.atc_code`,
              atcName: sql`excluded.atc_name`,
              licenseDate: sql`excluded.license_date`,
              licenseNumber: sql`excluded.license_number`,
              permitDate: sql`excluded.permit_date`,
              permitNumber: sql`excluded.permit_number`,
              suspensionCode: sql`excluded.suspension_code`,
              suspensionDate: sql`excluded.suspension_date`,
              prescriptionType: sql`excluded.prescription_type`,
              erxStatus: sql`excluded.erx_status`,
              erxDescription: sql`excluded.erx_description`,
              erxListedDate: sql`excluded.erx_listed_date`,
              isSelectable: sql`excluded.is_selectable`,
              searchText: sql`excluded.search_text`,
              sourceId: sql`excluded.source_id`,
              sourceRow: sql`excluded.source_row`,
            },
            setWhere: sql`(
              ${medicationProducts.productType},
              ${medicationProducts.name},
              ${medicationProducts.barcode},
              ${medicationProducts.companyName},
              ${medicationProducts.activeIngredientRaw},
              ${medicationProducts.atcCode},
              ${medicationProducts.atcName},
              ${medicationProducts.licenseDate},
              ${medicationProducts.licenseNumber},
              ${medicationProducts.permitDate},
              ${medicationProducts.permitNumber},
              ${medicationProducts.suspensionCode},
              ${medicationProducts.suspensionDate},
              ${medicationProducts.prescriptionType},
              ${medicationProducts.erxStatus},
              ${medicationProducts.erxDescription},
              ${medicationProducts.erxListedDate},
              ${medicationProducts.isSelectable},
              ${medicationProducts.searchText},
              ${medicationProducts.sourceId},
              ${medicationProducts.sourceRow}
            ) is distinct from (
              excluded.product_type,
              excluded.name,
              excluded.barcode,
              excluded.company_name,
              excluded.active_ingredient_raw,
              excluded.atc_code,
              excluded.atc_name,
              excluded.license_date,
              excluded.license_number,
              excluded.permit_date,
              excluded.permit_number,
              excluded.suspension_code,
              excluded.suspension_date,
              excluded.prescription_type,
              excluded.erx_status,
              excluded.erx_description,
              excluded.erx_listed_date,
              excluded.is_selectable,
              excluded.search_text,
              excluded.source_id,
              excluded.source_row
            )`,
          })
      },
    )

    const aliasCount = await inBatches<Record<string, unknown>>(
      path.join(dir, 'condition_aliases.jsonl.gz'),
      750,
      async (rows) => {
        await db.insert(conditionAliases).values(
          rows.map((r) => ({
            id: String(r.id),
            conditionId: String(r.conditionId),
            alias: String(r.alias),
            language: String(r.language),
            aliasType: String(r.aliasType),
            sourceId: String(r.source),
            translationStatus: (r.translationStatus as string | null) ?? null,
            searchNormalized: String(r.searchNormalized),
          })),
        ).onConflictDoNothing()
      },
    )
    const parentCount = await inBatches<Record<string, unknown>>(
      path.join(dir, 'condition_parents.jsonl.gz'),
      750,
      async (rows) => {
        await db.insert(conditionParents).values(
          rows.map((r) => ({
            childConditionId: String(r.childConditionId),
            parentConditionId: String(r.parentConditionId),
            relationType: String(r.relationType),
            sourceId: String(r.source),
            sourceDistance: Number(r.sourceDistance ?? 1),
          })),
        ).onConflictDoNothing()
      },
    )
    const externalIdCount = await inBatches<Record<string, unknown>>(
      path.join(dir, 'condition_external_ids.jsonl.gz'),
      750,
      async (rows) => {
        await db.insert(conditionExternalIds).values(
          rows.map((r) => ({
            id: String(r.id), conditionId: String(r.conditionId), system: String(r.system),
            externalId: String(r.externalId), mappingType: String(r.mappingType), sourceId: String(r.source),
          })),
        ).onConflictDoNothing()
      },
    )
    const crosswalkCount = await inBatches<Record<string, unknown>>(
      path.join(dir, 'condition_crosswalks.jsonl.gz'),
      500,
      async (rows) => {
        if (!rows.length) return
        await db.insert(conditionCrosswalks).values(
          rows.map((r) => ({
            id: String(r.id), conditionId: String(r.conditionId), targetSystem: String(r.targetSystem),
            targetId: String(r.targetId), mappingStatus: String(r.mappingStatus), sourceId: String(r.source),
          })),
        ).onConflictDoNothing()
      },
    )
    const categoryCount = await inBatches<Record<string, unknown>>(
      path.join(dir, 'condition_categories.jsonl.gz'),
      750,
      async (rows) => {
        await db.insert(conditionCategories).values(
          rows.map((r) => ({
            id: String(r.id), conditionId: String(r.conditionId), categoryCode: String(r.categoryCode),
            categoryEn: (r.categoryEn as string | null) ?? null, categoryTr: (r.categoryTr as string | null) ?? null,
            sourceId: String(r.source),
          })),
        ).onConflictDoNothing()
      },
    )
    const productAliasCount = await inBatches<Record<string, unknown>>(
      path.join(dir, 'medication_product_aliases.jsonl.gz'),
      750,
      async (rows) => {
        await db.insert(medicationProductAliases).values(
          rows.map((r) => ({
            id: String(r.id), medicationProductId: String(r.medicationProductId), alias: String(r.alias),
            aliasType: String(r.aliasType), sourceId: String(r.source), searchNormalized: String(r.searchNormalized),
          })),
        ).onConflictDoNothing()
      },
    )
    const substanceAliasCount = await inBatches<Record<string, unknown>>(
      path.join(dir, 'medication_substance_aliases.jsonl.gz'),
      750,
      async (rows) => {
        await db.insert(medicationSubstanceAliases).values(
          rows.map((r) => ({
            id: String(r.id), medicationSubstanceId: String(r.medicationSubstanceId), alias: String(r.alias),
            aliasType: String(r.aliasType), sourceId: String(r.source), searchNormalized: String(r.searchNormalized),
          })),
        ).onConflictDoNothing()
      },
    )
    const productSubstanceCount = await inBatches<Record<string, unknown>>(
      path.join(dir, 'medication_product_substances.jsonl.gz'),
      750,
      async (rows) => {
        await db.insert(medicationProductSubstances).values(
          rows.map((r) => ({
            medicationProductId: String(r.medicationProductId),
            medicationSubstanceId: String(r.medicationSubstanceId),
            relationType: String(r.relationType),
            sourceId: sourceIdFromMappingMethod(String(r.source)),
          })),
        ).onConflictDoNothing()
      },
    )

    console.log('\n--- Clinical ETL özeti ---')
    console.log(`Hastalık/klinik kavram: ${conditionCount.toLocaleString('tr-TR')}`)
    console.log(`Hastalık aliası: ${aliasCount.toLocaleString('tr-TR')}`)
    console.log(`Hiyerarşi ilişkisi: ${parentCount.toLocaleString('tr-TR')}`)
    console.log(`Dış kimlik: ${externalIdCount.toLocaleString('tr-TR')}`)
    console.log(`Belirsiz crosswalk: ${crosswalkCount.toLocaleString('tr-TR')}`)
    console.log(`Kategori bağı: ${categoryCount.toLocaleString('tr-TR')}`)
    console.log(`İlaç ürünü: ${productCount.toLocaleString('tr-TR')}`)
    console.log(`İlaç ürün aliası: ${productAliasCount.toLocaleString('tr-TR')}`)
    console.log(`Etkin madde ifadesi: ${substanceCount.toLocaleString('tr-TR')}`)
    console.log(`Etkin madde aliası: ${substanceAliasCount.toLocaleString('tr-TR')}`)
    console.log(`Ürün–etkin madde bağı: ${productSubstanceCount.toLocaleString('tr-TR')}`)
  } finally {
    await db.$client.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

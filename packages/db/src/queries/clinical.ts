import { and, asc, desc, eq, inArray, sql, type SQL } from 'drizzle-orm'
import type { Database } from '../client'
import { normalizeSearchText } from '../lib/normalize'
import {
  conditionAliases,
  conditionCategories,
  conditionExternalIds,
  conditionParents,
  conditions,
  medicationProductAliases,
  medicationProducts,
  medicationProductSubstances,
  medicationSubstanceAliases,
  medicationSubstances,
} from '../schema/clinical'

export interface ConditionSearchOptions {
  limit?: number
  includeInactive?: boolean
  neoplasmsOnly?: boolean
  uiReadyOnly?: boolean
  includeReview?: boolean
}

export async function searchConditions(
  db: Database,
  query: string,
  options: ConditionSearchOptions = {},
) {
  const normalized = normalizeSearchText(query)
  if (!normalized) return []
  const limit = Math.min(Math.max(options.limit ?? 30, 1), 100)
  const pattern = `%${normalized}%`
  const filters: SQL[] = [
    sql<boolean>`(
      ${conditions.searchText} ilike ${pattern}
      or exists (
        select 1
        from ${conditionAliases}
        where ${conditionAliases.conditionId} = ${conditions.id}
          and ${conditionAliases.searchNormalized} ilike ${pattern}
      )
    )`,
  ]
  if (!options.includeInactive) filters.push(eq(conditions.isActive, true))
  if (options.neoplasmsOnly) filters.push(eq(conditions.isNeoplasm, true))
  if (options.uiReadyOnly) filters.push(eq(conditions.isUiReady, true))
  if (options.includeReview === false) filters.push(eq(conditions.needsReview, false))

  return db
    .select({
      id: conditions.id,
      sourceCode: conditions.sourceCode,
      nameTr: conditions.nameTr,
      nameEn: conditions.nameEn,
      isNeoplasm: conditions.isNeoplasm,
      isUiReady: conditions.isUiReady,
      needsReview: conditions.needsReview,
      translationStatus: conditions.translationStatus,
    })
    .from(conditions)
    .where(and(...filters))
    .orderBy(desc(conditions.isUiReady), asc(conditions.needsReview), asc(conditions.nameTr))
    .limit(limit)
}

export async function findConditionsByAlias(
  db: Database,
  alias: string,
  options: { includeInactive?: boolean; limit?: number } = {},
) {
  const normalized = normalizeSearchText(alias)
  if (!normalized) return []

  const filters = [eq(conditionAliases.searchNormalized, normalized)]
  if (!options.includeInactive) filters.push(eq(conditions.isActive, true))

  return db
    .select({
      id: conditions.id,
      sourceCode: conditions.sourceCode,
      nameTr: conditions.nameTr,
      nameEn: conditions.nameEn,
      isNeoplasm: conditions.isNeoplasm,
      isUiReady: conditions.isUiReady,
      needsReview: conditions.needsReview,
      matchedAlias: conditionAliases.alias,
      matchedAliasLanguage: conditionAliases.language,
      matchedAliasType: conditionAliases.aliasType,
    })
    .from(conditionAliases)
    .innerJoin(conditions, eq(conditions.id, conditionAliases.conditionId))
    .where(and(...filters))
    .orderBy(desc(conditions.isUiReady), asc(conditions.needsReview), asc(conditions.nameTr))
    .limit(Math.min(Math.max(options.limit ?? 100, 1), 100))
}

export async function getConditionById(db: Database, conditionId: string) {
  const [condition] = await db
    .select()
    .from(conditions)
    .where(eq(conditions.id, conditionId))
    .limit(1)
  if (!condition) return null

  const [aliases, externalIds, categories, parentLinks, childLinks] = await Promise.all([
    db
      .select()
      .from(conditionAliases)
      .where(eq(conditionAliases.conditionId, conditionId))
      .orderBy(asc(conditionAliases.language), asc(conditionAliases.alias)),
    db
      .select()
      .from(conditionExternalIds)
      .where(eq(conditionExternalIds.conditionId, conditionId))
      .orderBy(asc(conditionExternalIds.system), asc(conditionExternalIds.externalId)),
    db
      .select()
      .from(conditionCategories)
      .where(eq(conditionCategories.conditionId, conditionId))
      .orderBy(asc(conditionCategories.categoryCode)),
    db.select().from(conditionParents).where(eq(conditionParents.childConditionId, conditionId)),
    db.select().from(conditionParents).where(eq(conditionParents.parentConditionId, conditionId)),
  ])

  const relatedIds = [
    ...new Set([
      ...parentLinks.map((row) => row.parentConditionId),
      ...childLinks.map((row) => row.childConditionId),
    ]),
  ]
  const related = relatedIds.length
    ? await db
        .select({
          id: conditions.id,
          sourceCode: conditions.sourceCode,
          nameTr: conditions.nameTr,
          nameEn: conditions.nameEn,
          isActive: conditions.isActive,
          isNeoplasm: conditions.isNeoplasm,
        })
        .from(conditions)
        .where(inArray(conditions.id, relatedIds))
    : []
  const relatedById = new Map(related.map((row) => [row.id, row]))

  return {
    ...condition,
    aliases,
    externalIds,
    categories,
    parents: parentLinks.map((link) => ({
      ...link,
      condition: relatedById.get(link.parentConditionId) ?? null,
    })),
    children: childLinks.map((link) => ({
      ...link,
      condition: relatedById.get(link.childConditionId) ?? null,
    })),
  }
}

export async function findConditionsByExternalId(db: Database, system: string, externalId: string) {
  return db
    .select({
      id: conditions.id,
      sourceCode: conditions.sourceCode,
      nameTr: conditions.nameTr,
      nameEn: conditions.nameEn,
      isActive: conditions.isActive,
      isNeoplasm: conditions.isNeoplasm,
      mappingType: conditionExternalIds.mappingType,
      sourceId: conditionExternalIds.sourceId,
    })
    .from(conditionExternalIds)
    .innerJoin(conditions, eq(conditions.id, conditionExternalIds.conditionId))
    .where(
      and(eq(conditionExternalIds.system, system), eq(conditionExternalIds.externalId, externalId)),
    )
    .orderBy(desc(conditions.isActive), asc(conditions.nameTr))
}

export async function getConditionByExternalId(db: Database, system: string, externalId: string) {
  const matches = await findConditionsByExternalId(db, system, externalId)
  if (matches.length === 0) return null
  if (matches.length > 1) {
    throw new Error(
      `Dış hastalık kimliği birden fazla canonical kayda bağlı: ${system}:${externalId}`,
    )
  }
  return getConditionById(db, matches[0]!.id)
}

export interface MedicationSearchOptions {
  limit?: number
  selectableOnly?: boolean
}

export async function searchMedicationProducts(
  db: Database,
  query: string,
  options: MedicationSearchOptions = {},
) {
  const normalized = normalizeSearchText(query)
  if (!normalized) return []
  const limit = Math.min(Math.max(options.limit ?? 30, 1), 100)
  const pattern = `%${normalized}%`
  const filters: SQL[] = [
    sql<boolean>`(
      ${medicationProducts.searchText} ilike ${pattern}
      or exists (
        select 1
        from ${medicationProductAliases}
        where ${medicationProductAliases.medicationProductId} = ${medicationProducts.id}
          and ${medicationProductAliases.searchNormalized} ilike ${pattern}
      )
      or exists (
        select 1
        from ${medicationProductSubstances}
        inner join ${medicationSubstances}
          on ${medicationSubstances.id} = ${medicationProductSubstances.medicationSubstanceId}
        where ${medicationProductSubstances.medicationProductId} = ${medicationProducts.id}
          and (
            ${medicationSubstances.searchText} ilike ${pattern}
            or exists (
              select 1
              from ${medicationSubstanceAliases}
              where ${medicationSubstanceAliases.medicationSubstanceId} = ${medicationSubstances.id}
                and ${medicationSubstanceAliases.searchNormalized} ilike ${pattern}
            )
          )
      )
    )`,
  ]
  if (options.selectableOnly !== false) filters.push(eq(medicationProducts.isSelectable, true))

  const products = await db
    .select({
      id: medicationProducts.id,
      name: medicationProducts.name,
      barcode: medicationProducts.barcode,
      activeIngredientRaw: medicationProducts.activeIngredientRaw,
      atcCode: medicationProducts.atcCode,
      atcName: medicationProducts.atcName,
      companyName: medicationProducts.companyName,
      prescriptionType: medicationProducts.prescriptionType,
      productType: medicationProducts.productType,
      erxStatus: medicationProducts.erxStatus,
      isSelectable: medicationProducts.isSelectable,
    })
    .from(medicationProducts)
    .where(and(...filters))
    .orderBy(desc(medicationProducts.isSelectable), asc(medicationProducts.name))
    .limit(limit)

  const productIds = products.map((product) => product.id)
  const substanceRows = productIds.length
    ? await db
        .select({
          medicationProductId: medicationProductSubstances.medicationProductId,
          id: medicationSubstances.id,
          nameTr: medicationSubstances.nameTr,
          isCombination: medicationSubstances.isCombination,
          needsReview: medicationSubstances.needsReview,
        })
        .from(medicationProductSubstances)
        .innerJoin(
          medicationSubstances,
          eq(medicationSubstances.id, medicationProductSubstances.medicationSubstanceId),
        )
        .where(inArray(medicationProductSubstances.medicationProductId, productIds))
        .orderBy(asc(medicationSubstances.nameTr))
    : []

  const substancesByProduct = new Map<string, typeof substanceRows>()
  for (const row of substanceRows) {
    const current = substancesByProduct.get(row.medicationProductId) ?? []
    current.push(row)
    substancesByProduct.set(row.medicationProductId, current)
  }

  return products.map((product) => ({
    ...product,
    substances: (substancesByProduct.get(product.id) ?? []).map(
      ({ medicationProductId: _, ...substance }) => substance,
    ),
  }))
}

export async function getMedicationProductsByBarcode(
  db: Database,
  barcode: string,
  options: MedicationSearchOptions = {},
) {
  const normalizedBarcode = barcode.trim()
  if (!normalizedBarcode) return []
  const filters = [eq(medicationProducts.barcode, normalizedBarcode)]
  if (options.selectableOnly !== false) filters.push(eq(medicationProducts.isSelectable, true))

  return db
    .select()
    .from(medicationProducts)
    .where(and(...filters))
    .orderBy(desc(medicationProducts.isSelectable), asc(medicationProducts.name))
    .limit(Math.min(Math.max(options.limit ?? 100, 1), 100))
}

export async function getMedicationProductById(db: Database, medicationProductId: string) {
  const [product] = await db
    .select()
    .from(medicationProducts)
    .where(eq(medicationProducts.id, medicationProductId))
    .limit(1)
  if (!product) return null

  const [aliases, substances] = await Promise.all([
    db
      .select()
      .from(medicationProductAliases)
      .where(eq(medicationProductAliases.medicationProductId, medicationProductId))
      .orderBy(asc(medicationProductAliases.alias)),
    db
      .select({
        id: medicationSubstances.id,
        nameTr: medicationSubstances.nameTr,
        normalizedName: medicationSubstances.normalizedName,
        isCombination: medicationSubstances.isCombination,
        needsReview: medicationSubstances.needsReview,
        mappingMethod: medicationSubstances.mappingMethod,
        relationType: medicationProductSubstances.relationType,
        sourceId: medicationProductSubstances.sourceId,
      })
      .from(medicationProductSubstances)
      .innerJoin(
        medicationSubstances,
        eq(medicationSubstances.id, medicationProductSubstances.medicationSubstanceId),
      )
      .where(eq(medicationProductSubstances.medicationProductId, medicationProductId))
      .orderBy(asc(medicationSubstances.nameTr)),
  ])

  return { ...product, aliases, substances }
}

export async function searchMedicationSubstances(db: Database, query: string, limitInput = 30) {
  const normalized = normalizeSearchText(query)
  if (!normalized) return []
  const limit = Math.min(Math.max(limitInput, 1), 100)
  const pattern = `%${normalized}%`
  return db
    .select({
      id: medicationSubstances.id,
      nameTr: medicationSubstances.nameTr,
      isCombination: medicationSubstances.isCombination,
      needsReview: medicationSubstances.needsReview,
    })
    .from(medicationSubstances)
    .where(
      sql<boolean>`(
      ${medicationSubstances.searchText} ilike ${pattern}
      or exists (
        select 1
        from ${medicationSubstanceAliases}
        where ${medicationSubstanceAliases.medicationSubstanceId} = ${medicationSubstances.id}
          and ${medicationSubstanceAliases.searchNormalized} ilike ${pattern}
      )
    )`,
    )
    .orderBy(asc(medicationSubstances.needsReview), asc(medicationSubstances.nameTr))
    .limit(limit)
}

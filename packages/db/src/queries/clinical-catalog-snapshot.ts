import { and, asc, count, eq, max } from 'drizzle-orm'
import type { Database } from '../client'
import {
  conditionAliases,
  conditions,
  medicationProductAliases,
  medicationProducts,
  medicationProductSubstances,
  medicationSubstanceAliases,
  medicationSubstances,
} from '../schema/clinical'

function timestamp(value: Date | string | null | undefined): string {
  if (!value) return 'none'
  return value instanceof Date ? value.toISOString() : value
}

export async function getClinicalCatalogVersion(db: Database): Promise<string> {
  const [conditionState, productState, substanceState, conditionAliasState, productAliasState, substanceAliasState, linkState] = await Promise.all([
    db.select({ total: count(), latest: max(conditions.updatedAt) }).from(conditions),
    db.select({ total: count(), latest: max(medicationProducts.updatedAt) }).from(medicationProducts),
    db.select({ total: count(), latest: max(medicationSubstances.updatedAt) }).from(medicationSubstances),
    db.select({ total: count() }).from(conditionAliases),
    db.select({ total: count() }).from(medicationProductAliases),
    db.select({ total: count() }).from(medicationSubstanceAliases),
    db.select({ total: count() }).from(medicationProductSubstances),
  ])
  return [
    'clinical-v1',
    conditionState[0]?.total ?? 0,
    timestamp(conditionState[0]?.latest),
    productState[0]?.total ?? 0,
    timestamp(productState[0]?.latest),
    substanceState[0]?.total ?? 0,
    timestamp(substanceState[0]?.latest),
    conditionAliasState[0]?.total ?? 0,
    productAliasState[0]?.total ?? 0,
    substanceAliasState[0]?.total ?? 0,
    linkState[0]?.total ?? 0,
  ].join(':')
}

function append(map: Map<string, string[]>, id: string, value: string) {
  const values = map.get(id) ?? []
  values.push(value)
  map.set(id, values)
}

export async function getClinicalCatalogSnapshot(db: Database) {
  const [conditionRows, conditionAliasRows, productRows, productAliasRows, substanceRows, substanceAliasRows, links] = await Promise.all([
    db
      .select({
        id: conditions.id,
        sourceCode: conditions.sourceCode,
        nameTr: conditions.nameTr,
        nameEn: conditions.nameEn,
        isNeoplasm: conditions.isNeoplasm,
        isUiReady: conditions.isUiReady,
        needsReview: conditions.needsReview,
        translationStatus: conditions.translationStatus,
        searchText: conditions.searchText,
      })
      .from(conditions)
      .where(eq(conditions.isActive, true))
      .orderBy(asc(conditions.nameTr)),
    db
      .select({ conditionId: conditionAliases.conditionId, search: conditionAliases.searchNormalized })
      .from(conditionAliases)
      .innerJoin(conditions, eq(conditions.id, conditionAliases.conditionId))
      .where(eq(conditions.isActive, true)),
    db
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
        searchText: medicationProducts.searchText,
      })
      .from(medicationProducts)
      .where(eq(medicationProducts.isSelectable, true))
      .orderBy(asc(medicationProducts.name)),
    db
      .select({
        medicationProductId: medicationProductAliases.medicationProductId,
        search: medicationProductAliases.searchNormalized,
      })
      .from(medicationProductAliases)
      .innerJoin(
        medicationProducts,
        eq(medicationProducts.id, medicationProductAliases.medicationProductId),
      )
      .where(eq(medicationProducts.isSelectable, true)),
    db
      .select({
        id: medicationSubstances.id,
        nameTr: medicationSubstances.nameTr,
        isCombination: medicationSubstances.isCombination,
        needsReview: medicationSubstances.needsReview,
        searchText: medicationSubstances.searchText,
      })
      .from(medicationSubstances)
      .orderBy(asc(medicationSubstances.nameTr)),
    db
      .select({
        medicationSubstanceId: medicationSubstanceAliases.medicationSubstanceId,
        search: medicationSubstanceAliases.searchNormalized,
      })
      .from(medicationSubstanceAliases),
    db
      .select({
        medicationProductId: medicationProductSubstances.medicationProductId,
        medicationSubstanceId: medicationProductSubstances.medicationSubstanceId,
        nameTr: medicationSubstances.nameTr,
        isCombination: medicationSubstances.isCombination,
        needsReview: medicationSubstances.needsReview,
        searchText: medicationSubstances.searchText,
      })
      .from(medicationProductSubstances)
      .innerJoin(
        medicationProducts,
        and(
          eq(medicationProducts.id, medicationProductSubstances.medicationProductId),
          eq(medicationProducts.isSelectable, true),
        ),
      )
      .innerJoin(
        medicationSubstances,
        eq(medicationSubstances.id, medicationProductSubstances.medicationSubstanceId),
      ),
  ])

  const conditionAliasesById = new Map<string, string[]>()
  const productAliasesById = new Map<string, string[]>()
  const substanceAliasesById = new Map<string, string[]>()
  const productSubstancesById = new Map<string, Array<Omit<(typeof links)[number], 'medicationProductId' | 'searchText'>>>()
  const productSubstanceSearch = new Map<string, string[]>()
  for (const row of conditionAliasRows) append(conditionAliasesById, row.conditionId, row.search)
  for (const row of productAliasRows) append(productAliasesById, row.medicationProductId, row.search)
  for (const row of substanceAliasRows) append(substanceAliasesById, row.medicationSubstanceId, row.search)
  for (const { medicationProductId, searchText, ...substance } of links) {
    const values = productSubstancesById.get(medicationProductId) ?? []
    values.push(substance)
    productSubstancesById.set(medicationProductId, values)
    append(productSubstanceSearch, medicationProductId, searchText)
    for (const alias of substanceAliasesById.get(substance.medicationSubstanceId) ?? []) {
      append(productSubstanceSearch, medicationProductId, alias)
    }
  }

  return {
    conditions: conditionRows.map(({ searchText, ...condition }) => ({
      ...condition,
      searchText: [searchText, ...(conditionAliasesById.get(condition.id) ?? [])].join(' '),
    })),
    medicationProducts: productRows.map(({ searchText, ...product }) => ({
      ...product,
      substances: productSubstancesById.get(product.id) ?? [],
      searchText: [
        searchText,
        ...(productAliasesById.get(product.id) ?? []),
        ...(productSubstanceSearch.get(product.id) ?? []),
      ].join(' '),
    })),
    medicationSubstances: substanceRows.map(({ searchText, ...substance }) => ({
      ...substance,
      searchText: [searchText, ...(substanceAliasesById.get(substance.id) ?? [])].join(' '),
    })),
  }
}

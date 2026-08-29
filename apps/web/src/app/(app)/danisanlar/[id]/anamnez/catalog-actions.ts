'use server'

import { db } from '@ogun/db'
import {
  getConditionById,
  getMedicationProductById,
  getMedicationProductsByBarcode,
  searchConditions,
  searchMedicationProducts,
  searchMedicationSubstances,
} from '@ogun/db/queries'
import { z } from 'zod'
import { withAuth } from '@/lib/authz'

const catalogQuerySchema = z.string().trim().min(2).max(120)
const catalogIdSchema = z.string().trim().min(1).max(160)
const barcodeSchema = z
  .string()
  .trim()
  .regex(/^\d{8,14}$/)

const searchConditionCatalog = withAuth(async (_ctx, query: string) =>
  searchConditions(db, catalogQuerySchema.parse(query), { limit: 24 }),
)

const readConditionCatalogItem = withAuth(async (_ctx, conditionId: string) =>
  getConditionById(db, catalogIdSchema.parse(conditionId)),
)

const searchMedicationCatalog = withAuth(async (_ctx, query: string) =>
  searchMedicationProducts(db, catalogQuerySchema.parse(query), {
    limit: 36,
    selectableOnly: true,
  }),
)

const readMedicationCatalogItem = withAuth(async (_ctx, medicationProductId: string) =>
  getMedicationProductById(db, catalogIdSchema.parse(medicationProductId)),
)

const searchSubstanceCatalog = withAuth(async (_ctx, query: string) =>
  searchMedicationSubstances(db, catalogQuerySchema.parse(query), 16),
)

const lookupMedicationBarcode = withAuth(async (_ctx, barcode: string) =>
  getMedicationProductsByBarcode(db, barcodeSchema.parse(barcode), {
    limit: 12,
    selectableOnly: true,
  }),
)

export async function searchConditionCatalogAction(query: string) {
  return searchConditionCatalog(query)
}

export async function getConditionCatalogItemAction(conditionId: string) {
  return readConditionCatalogItem(conditionId)
}

export async function searchMedicationCatalogAction(query: string) {
  return searchMedicationCatalog(query)
}

export async function getMedicationCatalogItemAction(medicationProductId: string) {
  return readMedicationCatalogItem(medicationProductId)
}

export async function searchMedicationSubstanceCatalogAction(query: string) {
  return searchSubstanceCatalog(query)
}

export async function lookupMedicationBarcodeAction(barcode: string) {
  return lookupMedicationBarcode(barcode)
}

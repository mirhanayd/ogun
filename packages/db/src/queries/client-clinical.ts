import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import type { Database } from '../client'
import { normalizeSearchText } from '../lib/normalize'
import { clientHealth, clients } from '../schema/clients'
import {
  clientConditions,
  clientMedications,
  conditions,
  medicationProducts,
  medicationProductSubstances,
  medicationSubstances,
} from '../schema/clinical'

async function assertClientInClinic(
  db: Database,
  clinicId: string,
  clientId: string,
): Promise<void> {
  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.clinicId, clinicId)))
    .limit(1)
  if (!client) throw new Error('Danışan bulunamadı veya bu kliniğe ait değil.')
}

function uniqueLabels(labels: readonly string[]): string[] {
  const seen = new Set<string>()
  return labels.flatMap((label) => {
    const trimmed = label.trim()
    const normalized = normalizeSearchText(trimmed)
    if (!normalized || seen.has(normalized)) return []
    seen.add(normalized)
    return [trimmed]
  })
}

export function withoutCatalogLabels(
  legacyLabels: readonly string[] | null | undefined,
  catalogLabels: readonly string[],
): string[] {
  const catalogKeys = new Set(catalogLabels.map(normalizeSearchText))
  return uniqueLabels(legacyLabels ?? []).filter(
    (label) => !catalogKeys.has(normalizeSearchText(label)),
  )
}

export function mergeLegacyAndCatalogLabels(
  legacyLabels: readonly string[] | null | undefined,
  catalogLabels: readonly string[],
): string[] {
  return uniqueLabels([...(legacyLabels ?? []), ...catalogLabels])
}

export async function getClientClinicalSelections(
  db: Database,
  clinicId: string,
  clientId: string,
) {
  await assertClientInClinic(db, clinicId, clientId)

  const selectedConditions = await db
    .select({
      id: clientConditions.id,
      conditionId: clientConditions.conditionId,
      status: clientConditions.status,
      diagnosedAt: clientConditions.diagnosedAt,
      note: clientConditions.note,
      nameTr: conditions.nameTr,
      nameEn: conditions.nameEn,
      sourceCode: conditions.sourceCode,
      isNeoplasm: conditions.isNeoplasm,
      needsReview: conditions.needsReview,
    })
    .from(clientConditions)
    .innerJoin(conditions, eq(conditions.id, clientConditions.conditionId))
    .where(eq(clientConditions.clientId, clientId))
    .orderBy(asc(conditions.nameTr))

  const selectedMedications = await db
    .select({
      id: clientMedications.id,
      medicationProductId: clientMedications.medicationProductId,
      medicationSubstanceId: clientMedications.medicationSubstanceId,
      customName: clientMedications.customName,
      dose: clientMedications.dose,
      doseUnit: clientMedications.doseUnit,
      frequency: clientMedications.frequency,
      route: clientMedications.route,
      startedAt: clientMedications.startedAt,
      endedAt: clientMedications.endedAt,
      isActive: clientMedications.isActive,
      note: clientMedications.note,
      productName: medicationProducts.name,
      productBarcode: medicationProducts.barcode,
      substanceName: medicationSubstances.nameTr,
      substanceNeedsReview: medicationSubstances.needsReview,
    })
    .from(clientMedications)
    .leftJoin(medicationProducts, eq(medicationProducts.id, clientMedications.medicationProductId))
    .leftJoin(
      medicationSubstances,
      eq(medicationSubstances.id, clientMedications.medicationSubstanceId),
    )
    .where(eq(clientMedications.clientId, clientId))
    .orderBy(desc(clientMedications.isActive))

  const productIds = selectedMedications.flatMap((row) =>
    row.medicationProductId ? [row.medicationProductId] : [],
  )
  const productSubstances = productIds.length
    ? await db
        .select({
          medicationProductId: medicationProductSubstances.medicationProductId,
          nameTr: medicationSubstances.nameTr,
        })
        .from(medicationProductSubstances)
        .innerJoin(
          medicationSubstances,
          eq(medicationSubstances.id, medicationProductSubstances.medicationSubstanceId),
        )
        .where(inArray(medicationProductSubstances.medicationProductId, productIds))
        .orderBy(asc(medicationSubstances.nameTr))
    : []
  const substanceNamesByProduct = new Map<string, string[]>()
  for (const row of productSubstances) {
    const names = substanceNamesByProduct.get(row.medicationProductId) ?? []
    names.push(row.nameTr)
    substanceNamesByProduct.set(row.medicationProductId, names)
  }

  return {
    conditions: selectedConditions,
    medications: selectedMedications.map((row) => ({
      ...row,
      productSubstanceNames: row.medicationProductId
        ? (substanceNamesByProduct.get(row.medicationProductId) ?? [])
        : [],
    })),
  }
}

export interface ClientConditionSelectionInput {
  conditionId: string
  status?: string
  diagnosedAt?: string | null
  note?: string | null
}

export async function replaceClientConditions(
  db: Database,
  clinicId: string,
  clientId: string,
  input: ClientConditionSelectionInput[],
) {
  await assertClientInClinic(db, clinicId, clientId)
  const ids = [...new Set(input.map((item) => item.conditionId))]
  if (ids.length !== input.length) throw new Error('Aynı hastalık birden fazla kez seçilemez.')

  const [catalogRows, currentSelections, healthRows] = await Promise.all([
    ids.length
      ? db
          .select({ id: conditions.id, nameTr: conditions.nameTr })
          .from(conditions)
          .where(and(inArray(conditions.id, ids), eq(conditions.isActive, true)))
      : [],
    db
      .select({ nameTr: conditions.nameTr })
      .from(clientConditions)
      .innerJoin(conditions, eq(conditions.id, clientConditions.conditionId))
      .where(eq(clientConditions.clientId, clientId)),
    db
      .select({ conditions: clientHealth.conditions })
      .from(clientHealth)
      .where(eq(clientHealth.clientId, clientId))
      .limit(1),
  ])
  if (catalogRows.length !== ids.length) {
    throw new Error('Seçilen hastalıklardan biri aktif katalogda bulunamadı.')
  }

  const nameById = new Map(catalogRows.map((row) => [row.id, row.nameTr]))
  const legacyOnly = withoutCatalogLabels(
    healthRows[0]?.conditions,
    currentSelections.map((row) => row.nameTr),
  )
  const catalogLabels = input.flatMap((item) => {
    const name = nameById.get(item.conditionId)
    return name ? [name] : []
  })
  const syncedLabels = mergeLegacyAndCatalogLabels(legacyOnly, catalogLabels)

  return db.transaction(async (tx) => {
    await tx.delete(clientConditions).where(eq(clientConditions.clientId, clientId))
    if (input.length > 0) {
      await tx.insert(clientConditions).values(
        input.map((item) => ({
          clientId,
          conditionId: item.conditionId,
          status: item.status ?? 'active',
          diagnosedAt: item.diagnosedAt ?? null,
          note: item.note ?? null,
        })),
      )
    }
    await tx
      .insert(clientHealth)
      .values({ clientId, conditions: syncedLabels })
      .onConflictDoUpdate({ target: clientHealth.clientId, set: { conditions: syncedLabels } })
    return { count: input.length, legacyLabels: legacyOnly, catalogLabels, syncedLabels }
  })
}

export interface ClientMedicationSelectionInput {
  medicationProductId?: string | null
  medicationSubstanceId?: string | null
  customName?: string | null
  dose?: string | null
  doseUnit?: string | null
  frequency?: string | null
  route?: string | null
  startedAt?: string | null
  endedAt?: string | null
  isActive?: boolean
  note?: string | null
}

function medicationSelectionKey(item: ClientMedicationSelectionInput): string {
  if (item.medicationProductId) return `product:${item.medicationProductId}`
  if (item.medicationSubstanceId) return `substance:${item.medicationSubstanceId}`
  return `custom:${normalizeSearchText(item.customName ?? '')}`
}

export async function replaceClientMedications(
  db: Database,
  clinicId: string,
  clientId: string,
  input: ClientMedicationSelectionInput[],
) {
  await assertClientInClinic(db, clinicId, clientId)
  if (
    input.some(
      (item) =>
        !item.medicationProductId && !item.medicationSubstanceId && !item.customName?.trim(),
    )
  ) {
    throw new Error('Her ilaç satırında ürün, etkin madde veya özel ad bulunmalıdır.')
  }
  const selectionKeys = input.map(medicationSelectionKey)
  if (new Set(selectionKeys).size !== selectionKeys.length) {
    throw new Error('Aynı ilaç veya etkin madde birden fazla kez seçilemez.')
  }

  const productIds = [
    ...new Set(
      input.flatMap((item) => (item.medicationProductId ? [item.medicationProductId] : [])),
    ),
  ]
  const substanceIds = [
    ...new Set(
      input.flatMap((item) => (item.medicationSubstanceId ? [item.medicationSubstanceId] : [])),
    ),
  ]
  const [productRows, substanceRows, currentSelections, healthRows] = await Promise.all([
    productIds.length
      ? db
          .select({ id: medicationProducts.id, name: medicationProducts.name })
          .from(medicationProducts)
          .where(
            and(
              inArray(medicationProducts.id, productIds),
              eq(medicationProducts.isSelectable, true),
            ),
          )
      : [],
    substanceIds.length
      ? db
          .select({ id: medicationSubstances.id, name: medicationSubstances.nameTr })
          .from(medicationSubstances)
          .where(inArray(medicationSubstances.id, substanceIds))
      : [],
    db
      .select({
        productName: medicationProducts.name,
        substanceName: medicationSubstances.nameTr,
        customName: clientMedications.customName,
      })
      .from(clientMedications)
      .leftJoin(
        medicationProducts,
        eq(medicationProducts.id, clientMedications.medicationProductId),
      )
      .leftJoin(
        medicationSubstances,
        eq(medicationSubstances.id, clientMedications.medicationSubstanceId),
      )
      .where(eq(clientMedications.clientId, clientId)),
    db
      .select({ medications: clientHealth.medications })
      .from(clientHealth)
      .where(eq(clientHealth.clientId, clientId))
      .limit(1),
  ])
  if (productRows.length !== productIds.length || substanceRows.length !== substanceIds.length) {
    throw new Error('Seçilen ilaç veya etkin maddelerden biri katalogda bulunamadı.')
  }

  const productName = new Map(productRows.map((row) => [row.id, row.name]))
  const substanceName = new Map(substanceRows.map((row) => [row.id, row.name]))
  const currentCatalogLabels = currentSelections.flatMap((row) => {
    const label = row.productName ?? row.substanceName
    return label ? [label] : []
  })
  const legacyOnly = withoutCatalogLabels(healthRows[0]?.medications, currentCatalogLabels)
  const catalogLabels = input.flatMap((item) => {
    const label =
      (item.medicationProductId && productName.get(item.medicationProductId)) ||
      (item.medicationSubstanceId && substanceName.get(item.medicationSubstanceId)) ||
      item.customName?.trim()
    return label ? [label] : []
  })
  const syncedLabels = mergeLegacyAndCatalogLabels(legacyOnly, catalogLabels)

  return db.transaction(async (tx) => {
    await tx.delete(clientMedications).where(eq(clientMedications.clientId, clientId))
    if (input.length > 0) {
      await tx.insert(clientMedications).values(
        input.map((item) => ({
          clientId,
          medicationProductId: item.medicationProductId ?? null,
          medicationSubstanceId: item.medicationSubstanceId ?? null,
          customName: item.customName?.trim() || null,
          dose: item.dose ?? null,
          doseUnit: item.doseUnit ?? null,
          frequency: item.frequency ?? null,
          route: item.route ?? null,
          startedAt: item.startedAt ?? null,
          endedAt: item.endedAt ?? null,
          isActive: item.isActive ?? true,
          note: item.note ?? null,
        })),
      )
    }
    await tx
      .insert(clientHealth)
      .values({ clientId, medications: syncedLabels })
      .onConflictDoUpdate({ target: clientHealth.clientId, set: { medications: syncedLabels } })
    return { count: input.length, legacyLabels: legacyOnly, catalogLabels, syncedLabels }
  })
}

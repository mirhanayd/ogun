'use server'

import { z } from 'zod'
import { db } from '@ogun/db'
import { listExchangeGroups, listFoodsForExchangeGroup } from '@ogun/db/queries'
import { buildGroupEquivalentsTable, type GroupEquivalentsRow } from '@ogun/nutrition-core'
import { withAuth } from '@/lib/authz'
import { withAudit } from '@/lib/audit'
import { findAllergenConflicts } from '@/lib/allergen-conflict'
import type { ClientAllergenEntry } from '@ogun/db/schema'
import type { PlanActionResult } from './actions'

// GitHub issue #28 / Prompt 5.6 — değişim listesi modunun server action'ları.
// AYRI bir dosyada tutuluyor (actions.ts'e EKLENMEDİ): exchange_groups/
// food_exchanges plan/danışan verisine bağımlı DEĞİL (bkz. queries/
// exchanges.ts dosya başı notu), o yüzden actions.ts'in geri kalanındaki
// "her action bir plan/kalem/öğün id'si alır" deseninden farklı bir aile —
// okunabilirlik için ayrı dosya.

function ok<T>(data?: T): PlanActionResult<T> {
  return { success: true, data }
}

function fail<T>(error: string): PlanActionResult<T> {
  return { success: false, error }
}

// --- Değişim grupları (referans veri) ---------------------------------------

const listExchangeGroupsForClinic = withAuth(
  withAudit({ action: 'read', entityType: 'exchange_group' }, async () => listExchangeGroups(db)),
)

export async function listExchangeGroupsAction(): Promise<
  PlanActionResult<Awaited<ReturnType<typeof listExchangeGroups>>>
> {
  try {
    return ok(await listExchangeGroupsForClinic())
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Değişim grupları alınamadı.')
  }
}

// --- GÖREV 3: "Değişim → besin önerisi" -------------------------------------

const exchangeGroupCodeSchema = z.enum(['EKMEK', 'ET', 'SUT', 'MEYVE', 'SEBZE', 'YAG'])

export interface ExchangeFoodSuggestion {
  foodId: string
  nameTr: string
  gramsPerExchange: number
  isPrimary: boolean
  portionLabel: string | null
  portionGrams: number | null
  // Danışanın alerji/intolerans listesiyle çakışıyorsa dolu — UI bu
  // besinleri elemek yerine (tamamen GİZLEMEK yanlış bir mühendislik kararı
  // olurdu, diyetisyen görüp bilinçli bir karar verebilmeli) kırmızı
  // işaretli gösterir, tıpkı plan-item-row.tsx'teki ShieldAlert deseniyle.
  allergenConflict: boolean
}

const listFoodsInputSchema = z.object({
  groupCode: exchangeGroupCodeSchema,
  limit: z.number().int().min(1).max(100).optional(),
  allergies: z.array(z.custom<ClientAllergenEntry>()).nullable().optional(),
  intolerances: z.array(z.custom<ClientAllergenEntry>()).nullable().optional(),
})
export type ListFoodsForExchangeGroupInput = z.infer<typeof listFoodsInputSchema>

const listFoodsForExchangeGroupForClinic = withAuth(
  withAudit(
    { action: 'read', entityType: 'food_exchange' },
    async (
      _ctx,
      groupCode: 'EKMEK' | 'ET' | 'SUT' | 'MEYVE' | 'SEBZE' | 'YAG',
      limit: number | undefined,
    ) => listFoodsForExchangeGroup(db, groupCode, limit),
  ),
)

// GÖREV 3 — "'1 ekmek değişimi' satırına tıklayınca o gruptan uygun
// besinleri listele. Danışanın alerji/intoleransları filtrelensin."
// "Filtrelensin" burada TAMAMEN gizlemek olarak DEĞİL, çakışanları
// işaretleyerek göstermek olarak yorumlandı (bkz. #26/plan-item-row.tsx'in
// AYNI kararı — kalem satırında da alerjen çakışan besin listeden
// SİLİNMİYOR, kırmızı ikonla işaretleniyor). Sıralama: çakışmayanlar önce.
export async function listFoodsForExchangeGroupAction(
  input: ListFoodsForExchangeGroupInput,
): Promise<PlanActionResult<ExchangeFoodSuggestion[]>> {
  const parsed = listFoodsInputSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Geçersiz veri gönderildi.')

  try {
    const rows = await listFoodsForExchangeGroupForClinic(parsed.data.groupCode, parsed.data.limit)
    const suggestions = rows.map((row) => ({
      foodId: row.foodId,
      nameTr: row.nameTr,
      gramsPerExchange: row.gramsPerExchange,
      isPrimary: row.isPrimary,
      portionLabel: row.portionLabel,
      portionGrams: row.portionGrams,
      allergenConflict:
        findAllergenConflicts(row.nameTr, parsed.data.allergies, parsed.data.intolerances).length >
        0,
    }))
    suggestions.sort((a, b) => Number(a.allergenConflict) - Number(b.allergenConflict))
    return ok(suggestions)
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Besin önerileri alınamadı.')
  }
}

// --- GÖREV 4: "Değişim formatında sonda grup eşdeğer tablosu bassın" -------
//
// Bu action GERÇEK PDF üretmiyor (roadmap Prompt 6.1'in kapsamı, bkz. issue
// #28 açıklaması) — sadece nutrition-core'un buildGroupEquivalentsTable'ının
// ihtiyaç duyduğu veriyi (her grup için birkaç uygun besin + varsa ev
// ölçüsü) toplar. apps/web tarafı (bkz. output-format-preview-dialog.tsx)
// bunu bir ÖNİZLEME/demo bileşeninde gösterir. Alerjen çakışan besinler
// BURADA (listFoodsForExchangeGroupAction'ın AKSİNE) tamamen ELENİR — bu
// tablo danışana giden bir ÇIKTININ parçası, "gözden geçir ve karar ver"
// aracı DEĞİL.
const equivalentsPreviewInputSchema = z.object({
  allergies: z.array(z.custom<ClientAllergenEntry>()).nullable().optional(),
  intolerances: z.array(z.custom<ClientAllergenEntry>()).nullable().optional(),
  foodsPerGroup: z.number().int().min(1).max(20).optional(),
})
export type ExchangeEquivalentsPreviewInput = z.infer<typeof equivalentsPreviewInputSchema>

export async function buildExchangeEquivalentsPreviewAction(
  input: ExchangeEquivalentsPreviewInput = {},
): Promise<PlanActionResult<GroupEquivalentsRow[]>> {
  const parsed = equivalentsPreviewInputSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Geçersiz veri gönderildi.')
  const foodsPerGroup = parsed.data.foodsPerGroup ?? 5

  try {
    const groups = await listExchangeGroupsForClinic()
    const foodsByGroupCode = new Map<
      string,
      { foodNameTr: string; gramsPerExchange: number; portionLabel: string | null; portionGrams: number | null }[]
    >()

    for (const group of groups) {
      const rows = await listFoodsForExchangeGroupForClinic(group.code, foodsPerGroup * 3)
      const filtered = rows
        .filter(
          (row) =>
            findAllergenConflicts(row.nameTr, parsed.data.allergies, parsed.data.intolerances)
              .length === 0,
        )
        .slice(0, foodsPerGroup)
        .map((row) => ({
          foodNameTr: row.nameTr,
          gramsPerExchange: row.gramsPerExchange,
          portionLabel: row.portionLabel,
          portionGrams: row.portionGrams,
        }))
      foodsByGroupCode.set(group.code, filtered)
    }

    const table = buildGroupEquivalentsTable(
      groups.map((g) => ({ code: g.code, nameTr: g.nameTr })),
      foodsByGroupCode,
    )
    return ok(table)
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Eşdeğerler tablosu hazırlanamadı.')
  }
}

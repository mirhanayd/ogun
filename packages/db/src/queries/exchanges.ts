import { asc, sql } from 'drizzle-orm'
import { exchangeGroups, type ExchangeGroupCode } from '../schema/exchanges'
import type { Database } from '../client'

// GitHub issue #28 / Prompt 5.6 — değişim listesi modunun sorgu katmanı.
// exchange_groups / food_exchanges GLOBAL referans veridir (Hafta 1'de
// açıldı, bkz. schema/exchanges.ts) — clients/plans gibi clinicId'ye bağlı
// DEĞİL, bu yüzden bu dosyadaki fonksiyonlar (plans.ts/clients.ts'in
// AKSİNE) bir clinicId parametresi ALMAZ. apps/web tarafı yine de bu
// action'ları withAuth ile sarmalar (bkz. planlar/exchange-actions.ts) —
// sadece OTURUM AÇMIŞ bir kullanıcı erişebilsin diye, klinik-scope
// filtrelemesi anlamlı olmadığı için değil.

export interface ExchangeGroupRow {
  id: string
  code: ExchangeGroupCode
  nameTr: string
  refKcal: number
  refProtein: number
  refCarb: number
  refFat: number
}

export async function listExchangeGroups(db: Database): Promise<ExchangeGroupRow[]> {
  const rows = await db.select().from(exchangeGroups).orderBy(asc(exchangeGroups.code))
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    nameTr: row.nameTr,
    refKcal: Number(row.refKcal),
    refProtein: Number(row.refProtein),
    refCarb: Number(row.refCarb),
    refFat: Number(row.refFat),
  }))
}

export interface ExchangeGroupFoodRow {
  foodId: string
  nameTr: string
  gramsPerExchange: number
  isPrimary: boolean
  // GitHub issue #28, GÖREV 4 — "1 ekmek değişimi = 25 g ekmek = 2 yemek
  // kaşığı pilav = ..." eşdeğerler tablosunun ev ölçüsü satırı için (bkz.
  // nutrition-core/src/exchange-equivalents.ts buildGroupEquivalentsRow).
  // Besinin food_portions'taki varsayılan porsiyonu — YOKSA null (tablo o
  // besin için sadece gram satırı gösterir).
  portionLabel: string | null
  portionGrams: number | null
}

// GitHub issue #28, GÖREV 3 — "'1 ekmek değişimi' satırına tıklayınca o
// gruptan uygun besinleri listele". Alerji/intolerans filtresi BURADA
// UYGULANMAZ (DB katmanı danışan bağlamını bilmiyor) — apps/web tarafı
// dönen listeyi lib/allergen-conflict.ts findAllergenConflicts ile filtreler
// (bkz. exchange-actions.ts listFoodsForExchangeGroupAction).
export async function listFoodsForExchangeGroup(
  db: Database,
  groupCode: ExchangeGroupCode,
  limit = 30,
): Promise<ExchangeGroupFoodRow[]> {
  const rows = await db.execute<{
    food_id: string
    name_tr: string
    grams_per_exchange: string
    is_primary: boolean
    portion_label: string | null
    portion_grams: string | null
  }>(sql`
    SELECT
      fe.food_id, f.name_tr, fe.grams_per_exchange, fe.is_primary,
      fp.label AS portion_label, fp.grams AS portion_grams
    FROM food_exchanges fe
    JOIN exchange_groups eg ON eg.id = fe.group_id
    JOIN foods f ON f.id = fe.food_id
    LEFT JOIN LATERAL (
      SELECT label, grams FROM food_portions
      WHERE food_id = fe.food_id
      ORDER BY is_default DESC, sort_order ASC
      LIMIT 1
    ) fp ON true
    WHERE eg.code::text = ${groupCode}
    ORDER BY fe.is_primary DESC, f.name_tr ASC
    LIMIT ${limit}
  `)

  return rows.map((row) => ({
    foodId: row.food_id,
    nameTr: row.name_tr,
    gramsPerExchange: Number(row.grams_per_exchange),
    isPrimary: row.is_primary,
    portionLabel: row.portion_label,
    portionGrams: row.portion_grams === null ? null : Number(row.portion_grams),
  }))
}

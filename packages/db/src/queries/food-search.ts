import { sql } from 'drizzle-orm'
import { normalizeSearchText } from '../lib/normalize'
import type { Database } from '../client'

export interface SearchFoodsInput {
  query: string
  limit?: number
  groupCode?: string
  sourceCode?: string
  verifiedOnly?: boolean
}

export interface SearchFoodsResult {
  id: string
  nameTr: string
  nameEn: string | null
  groupCode: string | null
  groupNameTr: string | null
  isVerified: boolean
}

// pg_trgm benzerliği + önek eşleşmesi karışımı. Sıralama: tam eşleşme > önek >
// trigram benzerliği; eşitlikte doğrulanmış besinler ve öncelikli kaynak önde.
// foods.searchText üzerindeki GIN (gin_trgm_ops) indeksi (bkz.
// packages/db/src/schema/foods.ts) bu sorguyu hızlandırır.
export async function searchFoods(db: Database, input: SearchFoodsInput): Promise<SearchFoodsResult[]> {
  const normalizedQuery = normalizeSearchText(input.query)
  if (normalizedQuery === '') return []

  const limit = Math.min(Math.max(input.limit ?? 20, 1), 100)

  const rows = await db.execute<{
    id: string
    name_tr: string
    name_en: string | null
    group_code: string | null
    group_name_tr: string | null
    is_verified: boolean
  }>(sql`
    SELECT f.id, f.name_tr, f.name_en, f.group_code, f.group_name_tr, f.is_verified
    FROM foods f
    JOIN data_sources ds ON ds.id = f.source_id
    WHERE
      (f.search_text % ${normalizedQuery} OR f.search_text LIKE ${normalizedQuery + '%'})
      AND (${input.groupCode ?? null}::text IS NULL OR f.group_code = ${input.groupCode ?? null})
      AND (${input.sourceCode ?? null}::text IS NULL OR ds.code = ${input.sourceCode ?? null})
      AND (${input.verifiedOnly ?? false} = false OR f.is_verified = true)
    ORDER BY
      CASE
        WHEN f.search_text = ${normalizedQuery} THEN 0
        WHEN f.search_text LIKE ${normalizedQuery + '%'} THEN 1
        ELSE 2
      END ASC,
      similarity(f.search_text, ${normalizedQuery}) DESC,
      f.is_verified DESC,
      ds.priority DESC
    LIMIT ${limit}
  `)

  return rows.map((row) => ({
    id: row.id,
    nameTr: row.name_tr,
    nameEn: row.name_en,
    groupCode: row.group_code,
    groupNameTr: row.group_name_tr,
    isVerified: row.is_verified,
  }))
}

export interface FoodPortionSummary {
  label: string
  grams: number
}

export interface FoodSummary {
  kcalPer100g: number | null
  defaultPortion: FoodPortionSummary | null
}

// Arama sonuçlarını hafif DTO'ya çevirmek için: her besinin (varsa) öncelikli
// kaynaktan gelen enerji değeri ve varsayılan porsiyonu. Küçük foodIds
// listeleri için (arama sonuçları) tasarlandı — tüm katalog için
// getAllFoodSummaries kullanılır (bkz. apps/web'in index route'u).
export async function getFoodSummaries(db: Database, foodIds: string[]): Promise<Map<string, FoodSummary>> {
  if (foodIds.length === 0) return new Map()

  const rows = await db.execute<{
    food_id: string
    kcal_per_100g: string | null
    portion_label: string | null
    portion_grams: string | null
  }>(sql`
    SELECT
      f.id AS food_id,
      fn.value_per_100g AS kcal_per_100g,
      fp.label AS portion_label,
      fp.grams AS portion_grams
    FROM foods f
    LEFT JOIN food_nutrients fn ON fn.food_id = f.id
      AND fn.is_preferred = true
      AND fn.nutrient_id = (SELECT id FROM nutrients WHERE code = 'ENERC_KCAL')
    LEFT JOIN LATERAL (
      SELECT label, grams FROM food_portions
      WHERE food_id = f.id
      ORDER BY is_default DESC, sort_order ASC
      LIMIT 1
    ) fp ON true
    WHERE f.id IN (${sql.join(
      foodIds.map((id) => sql`${id}`),
      sql`, `,
    )})
  `)

  const result = new Map<string, FoodSummary>()
  for (const row of rows) {
    result.set(row.food_id, {
      kcalPer100g: row.kcal_per_100g === null ? null : Number(row.kcal_per_100g),
      defaultPortion:
        row.portion_label && row.portion_grams
          ? { label: row.portion_label, grams: Number(row.portion_grams) }
          : null,
    })
  }
  return result
}

export interface FoodIndexEntry {
  id: string
  nameTr: string
  searchText: string
  // GitHub issue #24 / Prompt 5.2 GÖREV 1 — FoodSearchInput sonuç satırında
  // "ad, grup, varsayılan porsiyon, 100g kcal" gösterilmesi istendi; grup
  // adı offline indekste hiç yoktu, bu issue'da eklendi (bkz. food-index.ts).
  groupNameTr: string | null
  kcalPer100g: number | null
  defaultPortion: FoodPortionSummary | null
}

// İstemcinin (Dexie + Orama) offline arama indeksini kurmak için tüm katalogu
// TEK sorguda döner. Arama sayfası dışında bir yerde kullanılmamalı — 15.000+
// satır döndürür.
export async function getAllFoodIndexEntries(db: Database): Promise<FoodIndexEntry[]> {
  const rows = await db.execute<{
    id: string
    name_tr: string
    search_text: string
    group_name_tr: string | null
    kcal_per_100g: string | null
    portion_label: string | null
    portion_grams: string | null
  }>(sql`
    SELECT
      f.id, f.name_tr, f.search_text, f.group_name_tr,
      fn.value_per_100g AS kcal_per_100g,
      fp.label AS portion_label,
      fp.grams AS portion_grams
    FROM foods f
    LEFT JOIN food_nutrients fn ON fn.food_id = f.id
      AND fn.is_preferred = true
      AND fn.nutrient_id = (SELECT id FROM nutrients WHERE code = 'ENERC_KCAL')
    LEFT JOIN LATERAL (
      SELECT label, grams FROM food_portions
      WHERE food_id = f.id
      ORDER BY is_default DESC, sort_order ASC
      LIMIT 1
    ) fp ON true
  `)

  return rows.map((row) => ({
    id: row.id,
    nameTr: row.name_tr,
    searchText: row.search_text,
    groupNameTr: row.group_name_tr,
    kcalPer100g: row.kcal_per_100g === null ? null : Number(row.kcal_per_100g),
    defaultPortion:
      row.portion_label && row.portion_grams
        ? { label: row.portion_label, grams: Number(row.portion_grams) }
        : null,
  }))
}

// Katalog değiştiğinde değişen basit bir parmak izi (satır sayısı + son
// güncelleme zamanı). İstemci bunu ?v= olarak kullanır; değişmediyse ağa
// hiç çıkmaz (bkz. apps/web/src/lib/food-index.ts).
export async function getFoodIndexVersion(db: Database): Promise<string> {
  const [row] = await db.execute<{ count: string; max_updated: string | null }>(sql`
    SELECT count(*) AS count, max(updated_at) AS max_updated FROM foods
  `)
  const maxUpdated = row?.max_updated ? new Date(row.max_updated).getTime() : 0
  return `${row?.count ?? 0}-${maxUpdated}`
}

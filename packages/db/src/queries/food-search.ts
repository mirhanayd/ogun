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
export async function searchFoods(
  db: Database,
  input: SearchFoodsInput,
): Promise<SearchFoodsResult[]> {
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
  // GitHub issue #25 / Prompt 5.3 — plan editörünün öğün toplamı rozetleri
  // (kcal + makro) nutrition-core'un calculateMealNutrients'ını ÇAĞIRMAK
  // için besinin 100g başına protein/karbonhidrat/yağ değerine ihtiyaç
  // duyuyor. #24'ün bıraktığı kcal-only DTO'nun DOĞAL bir genişlemesi —
  // ayrı bir hesap yolu DEĞİL, aynı LATERAL/JOIN deseni üç nutrient
  // koduna daha uygulanıyor (bkz. aşağıdaki sorgu).
  proteinPer100g: number | null
  carbPer100g: number | null
  fatPer100g: number | null
  defaultPortion: FoodPortionSummary | null
}

// Arama sonuçlarını hafif DTO'ya çevirmek için: her besinin (varsa) öncelikli
// kaynaktan gelen enerji/makro değerleri ve varsayılan porsiyonu. Küçük
// foodIds listeleri için (arama sonuçları) tasarlandı — tüm katalog için
// getAllFoodIndexEntries kullanılır (bkz. apps/web'in index route'u).
export async function getFoodSummaries(
  db: Database,
  foodIds: string[],
): Promise<Map<string, FoodSummary>> {
  if (foodIds.length === 0) return new Map()

  const rows = await db.execute<{
    food_id: string
    kcal_per_100g: string | null
    protein_per_100g: string | null
    carb_per_100g: string | null
    fat_per_100g: string | null
    portion_label: string | null
    portion_grams: string | null
  }>(sql`
    SELECT
      f.id AS food_id,
      fn_kcal.value_per_100g AS kcal_per_100g,
      fn_protein.value_per_100g AS protein_per_100g,
      fn_carb.value_per_100g AS carb_per_100g,
      fn_fat.value_per_100g AS fat_per_100g,
      fp.label AS portion_label,
      fp.grams AS portion_grams
    FROM foods f
    LEFT JOIN food_nutrients fn_kcal ON fn_kcal.food_id = f.id
      AND fn_kcal.is_preferred = true
      AND fn_kcal.nutrient_id = (SELECT id FROM nutrients WHERE code = 'ENERC_KCAL')
    LEFT JOIN food_nutrients fn_protein ON fn_protein.food_id = f.id
      AND fn_protein.is_preferred = true
      AND fn_protein.nutrient_id = (SELECT id FROM nutrients WHERE code = 'PROCNT')
    LEFT JOIN food_nutrients fn_carb ON fn_carb.food_id = f.id
      AND fn_carb.is_preferred = true
      AND fn_carb.nutrient_id = (SELECT id FROM nutrients WHERE code = 'CHOCDF')
    LEFT JOIN food_nutrients fn_fat ON fn_fat.food_id = f.id
      AND fn_fat.is_preferred = true
      AND fn_fat.nutrient_id = (SELECT id FROM nutrients WHERE code = 'FAT')
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
      proteinPer100g: row.protein_per_100g === null ? null : Number(row.protein_per_100g),
      carbPer100g: row.carb_per_100g === null ? null : Number(row.carb_per_100g),
      fatPer100g: row.fat_per_100g === null ? null : Number(row.fat_per_100g),
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
  // GitHub issue #25 — bkz. FoodSummary üstündeki not: öğün toplamı
  // rozetleri (kcal + makro) nutrition-core'un calculateMealNutrients'ını
  // ÇAĞIRABİLMEK için istemci tarafı indekste de protein/karbonhidrat/yağ
  // gerekiyor (offline hesap, ağ gecikmesi olmadan).
  proteinPer100g: number | null
  carbPer100g: number | null
  fatPer100g: number | null
  defaultPortion: FoodPortionSummary | null
  // GitHub issue #26 / Prompt 5.4 — canlı besin öğesi panelinin ~60 besin
  // öğesi (isCore dahil tümü) üzerinden hesap yapabilmesi için TAM besin
  // öğesi haritası (nutrition-core'un NutrientValuesPer100g'ıyla BİREBİR
  // uyumlu şekil: kod -> 100g başına değer, DEĞERİ OLMAYAN kodlar haritada
  // hiç YOK — bkz. nutrition-core/src/warnings.ts checkMissingNutrientData,
  // "eksik" ile "sıfır" burada kasıtlı olarak ayrılıyor). kcalPer100g/
  // proteinPer100g/carbPer100g/fatPer100g alanları GERİYE DÖNÜK UYUMLULUK
  // için ayrıca duruyor (bu haritadan türetilir, ayrı bir sorgu YOK).
  nutrientsPer100g: Record<string, number>
  // food_nutrients.isImputed'ın (herhangi bir besin öğesi için) özeti —
  // plan.ts FoodReference.hasImputedValues ile AYNI anlam.
  hasImputedValues: boolean
  // GitHub issue #28 / Prompt 5.6, GÖREV 1 — Değişim modunun gram<->değişim
  // dönüşümü için besinin BİRİNCİL değişim grubu (food_exchanges.isPrimary,
  // yoksa gruplardan herhangi biri). Bir besinin hiç food_exchanges satırı
  // yoksa null — değişim modunda bu besin için dönüşüm YAPILAMAZ, UI kalemi
  // gram olarak göstermeye devam eder (bkz. plan-item-row.tsx).
  exchange: { groupCode: string; groupNameTr: string; gramsPerExchange: number } | null
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
    portion_label: string | null
    portion_grams: string | null
    // postgres-js jsonb sütunlarını otomatik JS nesnesine çevirir — değerler
    // numeric olduğu için ya number ya da (sürücüye göre) string gelebilir,
    // bu yüzden aşağıdaki map adımında her ikisi de Number() ile güvenceye
    // alınıyor.
    nutrients_json: Record<string, number | string> | null
    has_imputed: boolean | null
    exchange_group_code: string | null
    exchange_group_name_tr: string | null
    exchange_grams_per_exchange: string | null
  }>(sql`
    SELECT
      f.id, f.name_tr, f.search_text, f.group_name_tr,
      fp.label AS portion_label,
      fp.grams AS portion_grams,
      na.nutrients_json,
      na.has_imputed,
      fx.group_code AS exchange_group_code,
      fx.group_name_tr AS exchange_group_name_tr,
      fx.grams_per_exchange AS exchange_grams_per_exchange
    FROM foods f
    LEFT JOIN LATERAL (
      SELECT label, grams FROM food_portions
      WHERE food_id = f.id
      ORDER BY is_default DESC, sort_order ASC
      LIMIT 1
    ) fp ON true
    LEFT JOIN LATERAL (
      SELECT
        jsonb_object_agg(n.code, fn.value_per_100g) AS nutrients_json,
        bool_or(fn.is_imputed) AS has_imputed
      FROM food_nutrients fn
      JOIN nutrients n ON n.id = fn.nutrient_id
      WHERE fn.food_id = f.id AND fn.is_preferred = true
    ) na ON true
    LEFT JOIN LATERAL (
      SELECT eg.code AS group_code, eg.name_tr AS group_name_tr, fe.grams_per_exchange
      FROM food_exchanges fe
      JOIN exchange_groups eg ON eg.id = fe.group_id
      WHERE fe.food_id = f.id
      ORDER BY fe.is_primary DESC
      LIMIT 1
    ) fx ON true
  `)

  return rows.map((row) => {
    const nutrientsPer100g: Record<string, number> = {}
    for (const [code, value] of Object.entries(row.nutrients_json ?? {})) {
      nutrientsPer100g[code] = Number(value)
    }

    return {
      id: row.id,
      nameTr: row.name_tr,
      searchText: row.search_text,
      groupNameTr: row.group_name_tr,
      kcalPer100g: nutrientsPer100g.ENERC_KCAL ?? null,
      proteinPer100g: nutrientsPer100g.PROCNT ?? null,
      carbPer100g: nutrientsPer100g.CHOCDF ?? null,
      fatPer100g: nutrientsPer100g.FAT ?? null,
      defaultPortion:
        row.portion_label && row.portion_grams
          ? { label: row.portion_label, grams: Number(row.portion_grams) }
          : null,
      nutrientsPer100g,
      hasImputedValues: row.has_imputed ?? false,
      exchange:
        row.exchange_group_code && row.exchange_group_name_tr && row.exchange_grams_per_exchange
          ? {
              groupCode: row.exchange_group_code,
              groupNameTr: row.exchange_group_name_tr,
              gramsPerExchange: Number(row.exchange_grams_per_exchange),
            }
          : null,
    }
  })
}

export interface NutrientDefinition {
  code: string
  nameTr: string
  unit: string
  category: string
  isCore: boolean
  displayOrder: number
}

// GitHub issue #26 / Prompt 5.4, GÖREV 2 — mikro besin öğesi listesinin
// (isCore=true olan ~15 + "Tümünü göster" ile ~60) ad/birim/kategori
// metadata'sı. Katalog küçük (~60 satır) olduğu için ayrı bir uç NOKTA
// açmıyoruz — /api/foods/index cevabına EKLENİYOR (bkz. route.ts), istemci
// aynı versiyonlu indeks yenilemesiyle bunu da alır.
export async function getNutrientDefinitions(db: Database): Promise<NutrientDefinition[]> {
  const rows = await db.execute<{
    code: string
    name_tr: string
    unit: string
    category: string
    is_core: boolean
    display_order: number
  }>(sql`
    SELECT code, name_tr, unit, category, is_core, display_order
    FROM nutrients
    ORDER BY display_order ASC
  `)

  return rows.map((row) => ({
    code: row.code,
    nameTr: row.name_tr,
    unit: row.unit,
    category: row.category,
    isCore: row.is_core,
    displayOrder: row.display_order,
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

import Dexie, { type EntityTable } from 'dexie'
import { create, insertMultiple, search } from '@orama/orama'
import { normalizeSearchText } from './normalize'

export interface FoodIndexRow {
  id: string
  nameTr: string
  searchText: string
  // GitHub issue #24 / Prompt 5.2 GÖREV 1 — FoodSearchInput sonuç satırında
  // grup adı gösterilmesi gerekti (bkz. queries/food-search.ts FoodIndexEntry).
  // Dexie versiyonu ARTIRILMADI: bu alan indekslenmiyor (stores: 'id, searchText'
  // aynı kalıyor), sadece satıra ek bir düz alan olarak ekleniyor — Dexie
  // şemada listelenmeyen alanları da satırda saklamaya zaten izin veriyor
  // (kcalPer100g/defaultPortionLabel de aynı şekilde indekssiz).
  groupNameTr: string | null
  kcalPer100g: number | null
  // GitHub issue #25 — plan editörünün öğün toplamı rozetleri (kcal + makro)
  // nutrition-core'un calculateMealNutrients'ını çağırabilsin diye; #24'ün
  // kcal-only alanlarıyla AYNI desende, indekslenmeyen düz alanlar.
  proteinPer100g: number | null
  carbPer100g: number | null
  fatPer100g: number | null
  defaultPortionLabel: string | null
  defaultPortionGrams: number | null
  // GitHub issue #26 / Prompt 5.4, GÖREV 4 — canlı besin öğesi panelinin
  // "Hesap İSTEMCİDE yapılsın... Besin verisi Dexie'den okunsun" kuralı: ~60
  // besin öğesinin TAMAMI (sadece kcal/protein/karb/yağ değil) burada,
  // ağ gecikmesi olmadan okunabilsin diye satırda taşınıyor. Değeri olmayan
  // kodlar haritada hiç YOK (bkz. FoodIndexEntry üstündeki not — "eksik"
  // ile "sıfır" ayrımı nutrition-core'un MISSING_NUTRIENT_DATA uyarısının
  // temeli).
  nutrientsPer100g: Record<string, number>
  hasImputedValues: boolean
  // GitHub issue #28 / Prompt 5.6, GÖREV 1 — bkz.
  // packages/db/src/queries/food-search.ts FoodIndexEntry.exchange üstündeki
  // not: değişim modunun gram<->değişim dönüşümü için besinin birincil
  // değişim grubu. AYNI desen — indekslenmeyen düz alan.
  exchange: { groupCode: string; groupNameTr: string; gramsPerExchange: number } | null
}

interface MetaRow {
  key: string
  value: string
}

// GitHub issue #26 / Prompt 5.4 — mikro besin öğesi listesinin ad/birim/
// isCore metadata'sı, /api/foods/index cevabıyla AYNI versiyonlu önbellekte
// (bkz. ensureIndexLoaded) gelir, ayrı bir Dexie tablosunda saklanır.
export interface NutrientDefRow {
  code: string
  nameTr: string
  unit: string
  category: string
  isCore: boolean
  displayOrder: number
}

class FoodIndexDb extends Dexie {
  foods!: EntityTable<FoodIndexRow, 'id'>
  meta!: EntityTable<MetaRow, 'key'>
  nutrientDefs!: EntityTable<NutrientDefRow, 'code'>

  constructor() {
    super('ogun-food-index')
    this.version(1).stores({
      foods: 'id, searchText',
      meta: 'key',
    })
    // GitHub issue #26 — yeni bir tablo (nutrientDefs) eklendiği için Dexie
    // sürüm ATLAMASI gerekiyor (yeni store'lar sadece version() ile açılır).
    // foods/meta şemaları DEĞİŞMEDİ (nutrientsPer100g/hasImputedValues
    // indekslenmeyen düz alanlar — kcalPer100g/proteinPer100g'nin AYNI
    // deseni, bkz. FoodIndexRow üstündeki notlar), o yüzden onlar için ayrıca
    // bir migrasyon adımı gerekmiyor.
    this.version(2).stores({
      foods: 'id, searchText',
      meta: 'key',
      nutrientDefs: 'code',
    })
  }
}

const dexieDb = new FoodIndexDb()

const oramaSchema = {
  id: 'string',
  nameTr: 'string',
  searchText: 'string',
} as const

type OramaDb = Awaited<ReturnType<typeof create<typeof oramaSchema>>>

let oramaIndexPromise: Promise<OramaDb> | null = null

async function getStoredVersion(): Promise<string | null> {
  const row = await dexieDb.meta.get('version')
  return row?.value ?? null
}

async function setStoredVersion(version: string) {
  await dexieDb.meta.put({ key: 'version', value: version })
}

// GitHub issue #60 — EŞ ZAMANLI YÜKLEME KİLİDİ (bu issue'nun konusu DEĞİL,
// landing sayfasının ürün görseli için plan editörünün ekran görüntüsü
// alınırken BULUNAN GERÇEK HATA).
//
// SEMPTOM: plan editörü açıldığında her öğün bloğunun kendi
// FoodSearchInput'u mount olurken `initFoodIndex()` çağırıyor. 6 standart
// öğünlü bir planda bu 6 EŞ ZAMANLI çağrı demek ve `ensureIndexLoaded`ın
// hiçbir tekilleştirmesi (in-flight guard) yoktu: tarayıcı `/api/foods/
// index`i 6 KEZ indiriyor (bu ortamda tek başına ~14 MB ham / ~3 MB gzip,
// bkz. docs/performance.md bölüm 5) ve ardından 6 ayrı `readwrite`
// Dexie transaction'ı AYNI tabloda `foods.clear()` + 15.402 satırlık
// `bulkPut` yapmaya çalışıyor. Transaction'lar sıraya giriyor, her biri
// bir öncekinin yazdığını SİLİP baştan yazıyor — ölçüldü: 10 dakika sonra
// bile indeks OTURMADI, plan kalemleri "Bilinmeyen besin" olarak kaldı ve
// canlı besin öğesi paneli hiçbir şey hesaplayamadı.
//
// DÜZELTME: aynı dosyadaki `oramaIndexPromise` deseninin AYNISI — yükleme
// bir kez başlar, eş zamanlı çağıranlar AYNI promise'i bekler. Hata
// durumunda promise sıfırlanır (yeniden denenebilir olsun diye). Davranış
// farkı: aynı sayfa oturumunda ikinci bir mount artık 304 sürüm kontrolü
// YAPMAZ — tek bir sayfa görüntülemesi içinde katalog değişmeyeceği için
// bu bilinçli ve istenen sonuç.
let indexLoadPromise: Promise<void> | null = null

async function ensureIndexLoaded(): Promise<void> {
  if (!indexLoadPromise) {
    indexLoadPromise = downloadAndStoreIndex().catch((error: unknown) => {
      indexLoadPromise = null
      throw error
    })
  }
  return indexLoadPromise
}

// İlk açılışta (veya sunucudaki katalog değiştiğinde) tüm indeksi indirip
// Dexie'ye yazar. Sürüm değişmediyse ağa hiç çıkmaz — sunucu 304 döner.
async function downloadAndStoreIndex(): Promise<void> {
  const storedVersion = await getStoredVersion()
  const url = storedVersion
    ? `/api/foods/index?v=${encodeURIComponent(storedVersion)}`
    : '/api/foods/index'

  const response = await fetch(url)

  if (response.status === 304) {
    return
  }
  if (!response.ok) {
    throw new Error(`Besin indeksi indirilemedi: ${response.status}`)
  }

  const { version, entries, nutrientDefs } = (await response.json()) as {
    version: string
    entries: Array<{
      id: string
      nameTr: string
      searchText: string
      groupNameTr: string | null
      kcalPer100g: number | null
      proteinPer100g: number | null
      carbPer100g: number | null
      fatPer100g: number | null
      defaultPortion: { label: string; grams: number } | null
      nutrientsPer100g: Record<string, number>
      hasImputedValues: boolean
      exchange: { groupCode: string; groupNameTr: string; gramsPerExchange: number } | null
    }>
    nutrientDefs: NutrientDefRow[]
  }

  await dexieDb.transaction('rw', dexieDb.foods, dexieDb.meta, dexieDb.nutrientDefs, async () => {
    await dexieDb.foods.clear()
    await dexieDb.foods.bulkPut(
      entries.map((entry) => ({
        id: entry.id,
        nameTr: entry.nameTr,
        searchText: entry.searchText,
        groupNameTr: entry.groupNameTr,
        kcalPer100g: entry.kcalPer100g,
        proteinPer100g: entry.proteinPer100g,
        carbPer100g: entry.carbPer100g,
        fatPer100g: entry.fatPer100g,
        defaultPortionLabel: entry.defaultPortion?.label ?? null,
        defaultPortionGrams: entry.defaultPortion?.grams ?? null,
        nutrientsPer100g: entry.nutrientsPer100g,
        hasImputedValues: entry.hasImputedValues,
        exchange: entry.exchange,
      })),
    )
    await dexieDb.nutrientDefs.clear()
    await dexieDb.nutrientDefs.bulkPut(nutrientDefs)
    await setStoredVersion(version)
  })

  // Yeni veri geldiğinde bellekteki Orama indeksi bayatlar, yeniden kurulacak.
  oramaIndexPromise = null
}

// GitHub issue #26 / Prompt 5.4 — mikro besin öğesi listesinin metadata'sı
// (ad/birim/isCore), önbellekten (initFoodIndex çağrılmış olmalı).
export async function getNutrientDefinitions(): Promise<NutrientDefRow[]> {
  // NOT: orderBy() Dexie'de INDEKSLİ bir alan gerektirir (sadece 'code'
  // indeksli, bkz. FoodIndexDb.version(2)) — sortBy() indeks gerektirmez,
  // JS tarafında sıralar. ~60 satırlık küçük bir tablo için maliyeti önemsiz.
  return dexieDb.nutrientDefs.toCollection().sortBy('displayOrder')
}

async function buildOramaIndex(): Promise<OramaDb> {
  const oramaDb = await create({ schema: oramaSchema })
  const rows = await dexieDb.foods.toArray()
  if (rows.length > 0) {
    await insertMultiple(
      oramaDb,
      rows.map((row) => ({ id: row.id, nameTr: row.nameTr, searchText: row.searchText })),
    )
  }
  return oramaDb
}

async function getOramaIndex(): Promise<OramaDb> {
  if (!oramaIndexPromise) {
    oramaIndexPromise = buildOramaIndex()
  }
  return oramaIndexPromise
}

export async function initFoodIndex(): Promise<void> {
  await ensureIndexLoaded()
  await getOramaIndex()
}

// GitHub issue #25 — plan editörünün öğün toplamı hesabı (bkz.
// lib/plan-nutrients.ts) plan_items.foodId'lere karşılık gelen besin
// öğesi değerlerini AĞA ÇIKMADAN okumak için bu fonksiyonu kullanır.
// searchFoodsOffline'ın AKSİNE bir arama sorgusu YOK, sadece bilinen
// id'lerin doğrudan Dexie'den toplu okunması (initFoodIndex çağrılmış
// olmalı — bkz. çağıranlar).
export async function getFoodIndexEntriesByIds(ids: string[]): Promise<Map<string, FoodIndexRow>> {
  if (ids.length === 0) return new Map()
  const rows = await dexieDb.foods.bulkGet(ids)
  const result = new Map<string, FoodIndexRow>()
  for (const row of rows) {
    if (row) result.set(row.id, row)
  }
  return result
}

export interface FoodSearchHit {
  id: string
  nameTr: string
  groupNameTr: string | null
  kcalPer100g: number | null
  proteinPer100g: number | null
  carbPer100g: number | null
  fatPer100g: number | null
  defaultPortion: { label: string; grams: number } | null
}

const P95_WARN_THRESHOLD_MS = 20

export async function searchFoodsOffline(
  query: string,
  limit = 20,
): Promise<{ hits: FoodSearchHit[]; elapsedMs: number }> {
  const start = performance.now()

  const oramaDb = await getOramaIndex()
  const normalizedQuery = normalizeSearchText(query)
  const result = await search(oramaDb, { term: normalizedQuery, limit })

  const rows = await dexieDb.foods.bulkGet(result.hits.map((hit) => hit.document.id as string))
  const hits: FoodSearchHit[] = rows
    .filter((row): row is FoodIndexRow => row !== undefined)
    .map((row) => ({
      id: row.id,
      nameTr: row.nameTr,
      groupNameTr: row.groupNameTr,
      kcalPer100g: row.kcalPer100g,
      proteinPer100g: row.proteinPer100g,
      carbPer100g: row.carbPer100g,
      fatPer100g: row.fatPer100g,
      defaultPortion:
        row.defaultPortionLabel && row.defaultPortionGrams !== null
          ? { label: row.defaultPortionLabel, grams: row.defaultPortionGrams }
          : null,
    }))

  const elapsedMs = performance.now() - start
  if (elapsedMs > P95_WARN_THRESHOLD_MS) {
    console.warn(
      `searchFoodsOffline yavaş: ${elapsedMs.toFixed(1)}ms (hedef < ${P95_WARN_THRESHOLD_MS}ms)`,
    )
  }

  logFoodSearchQueryAsync(query, hits.length)

  return { hits, elapsedMs }
}

// GitHub issue #47 / Prompt 8.3, GÖREV 4 — "arama sonucu bulunamayan
// sorgular" en kritik pilot metriği. searchFoodsOffline TAMAMEN istemci
// tarafında (Dexie/Orama) çalıştığı için sunucunun bu aramalardan HABERİ
// olmuyor — bu yüzden her aramadan sonra (komut paleti VE food-search-input,
// ikisi de searchFoodsOffline'ı çağırıyor, TEK bir noktadan loglanıyor)
// sonucu (SADECE sorgu metni + kaç sonuç döndüğü, bkz. api/analytics/
// food-search/route.ts) sunucuya bildiriyoruz. Fire-and-forget: bu
// isteğin başarısız olması aramanın kendisini ASLA engellemez. Çok kısa
// (tek karakterlik, kazara basılan) sorgular gürültü yaratmasın diye 2
// karakterden kısa sorgular loglanmıyor.
function logFoodSearchQueryAsync(query: string, resultCount: number): void {
  const trimmed = query.trim()
  if (trimmed.length < 2) return
  try {
    void fetch('/api/analytics/food-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: trimmed, resultCount }),
      keepalive: true,
    }).catch(() => {})
  } catch {
    // Sessizce yut — arama günlüğü aramanın kendisini engellemez.
  }
}

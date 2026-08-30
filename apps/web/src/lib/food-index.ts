import Dexie, { type EntityTable } from 'dexie'
import { create, insertMultiple, search } from '@orama/orama'
import { invoke } from '@tauri-apps/api/core'
import { isNativeShell } from './native-shell'
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
  ingredientNames: string[]
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

type NativeFoodEntry = Omit<FoodIndexRow, 'defaultPortionLabel' | 'defaultPortionGrams' | 'nutrientsPer100g' | 'hasImputedValues'> & {
  defaultPortion?: { label: string; grams: number } | null
}

function nativeFoodEntryToRow(entry: NativeFoodEntry): FoodIndexRow {
  const macroPairs: Array<[string, number | null]> = [
    ['ENERC_KCAL', entry.kcalPer100g],
    ['PROCNT', entry.proteinPer100g],
    ['CHOCDF', entry.carbPer100g],
    ['FAT', entry.fatPer100g],
  ]
  return {
    ...entry,
    defaultPortionLabel: entry.defaultPortion?.label ?? null,
    defaultPortionGrams: entry.defaultPortion?.grams ?? null,
    nutrientsPer100g: Object.fromEntries(
      macroPairs.filter((pair): pair is [string, number] => pair[1] !== null),
    ),
    hasImputedValues: false,
  }
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

// Büyük IndexedDB ve Orama işlemleri async görünse de JS ana iş parçacığını
// uzun süre meşgul edebilir. Küçük partiler arasında event loop'a dönmek,
// pencere kontrolleri ve menülerin katalog hazırlanırken de çalışmasını sağlar.
const INDEX_WRITE_BATCH_SIZE = 300
const ORAMA_BUILD_BATCH_SIZE = 500

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

async function getStoredVersion(
  key: 'searchVersion' | 'nutrientVersion' = 'searchVersion',
): Promise<string | null> {
  const row = await dexieDb.meta.get(key)
  if (row) return row.value
  const legacy = await dexieDb.meta.get('version')
  return legacy?.value ?? null
}

async function setStoredVersion(
  version: string,
  key: 'searchVersion' | 'nutrientVersion' = 'searchVersion',
) {
  await dexieDb.meta.put({ key, value: version })
}

async function fetchCurrentVersion(): Promise<string> {
  const response = await fetch('/api/foods/index/version', { cache: 'no-store' })
  if (!response.ok) throw new Error(`Besin indeksi sürümü alınamadı: ${response.status}`)
  return ((await response.json()) as { version: string }).version
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
  const storedVersion = await getStoredVersion('searchVersion')
  const [cachedFoodCount, cachedNutrientCount] = await Promise.all([
    dexieDb.foods.count(),
    dexieDb.nutrientDefs.count(),
  ])
  const hasUsableCache = storedVersion !== null && cachedFoodCount > 0 && cachedNutrientCount > 0

  let currentVersion: string
  try {
    currentVersion = await fetchCurrentVersion()
  } catch (error: unknown) {
    if (hasUsableCache) return
    throw error
  }
  if (hasUsableCache && currentVersion === storedVersion) return

  let response: Response
  try {
    response = await fetch(`/api/foods/index?v=${encodeURIComponent(currentVersion)}`)
  } catch (error: unknown) {
    // Masaüstü webview'i ağ kesildikten sonra aynı katalogla plan yazmaya ve
    // mikro/makro hesaplamaya devam edebilmeli. Dexie'deki tam katalog varsa
    // ağ hatası bir başlatma hatası değildir; yalnızca yenileme ertelenir.
    if (hasUsableCache) return
    throw error
  }

  if (!response.ok) {
    if (hasUsableCache) return
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
      ingredientNames: string[]
      exchange: { groupCode: string; groupNameTr: string; gramsPerExchange: number } | null
    }>
    nutrientDefs: NutrientDefRow[]
  }

  const previousRows = new Map((await dexieDb.foods.toArray()).map((row) => [row.id, row]))
  await dexieDb.transaction('rw', dexieDb.foods, dexieDb.nutrientDefs, async () => {
    await dexieDb.foods.clear()
    await dexieDb.nutrientDefs.clear()
    await dexieDb.nutrientDefs.bulkPut(nutrientDefs)
  })

  for (let start = 0; start < entries.length; start += INDEX_WRITE_BATCH_SIZE) {
    const batch = entries.slice(start, start + INDEX_WRITE_BATCH_SIZE)
    await dexieDb.foods.bulkPut(
      batch.map((entry) => {
        const previous = previousRows.get(entry.id)
        const macroPairs: Array<[string, number | null]> = [
          ['ENERC_KCAL', entry.kcalPer100g],
          ['PROCNT', entry.proteinPer100g],
          ['CHOCDF', entry.carbPer100g],
          ['FAT', entry.fatPer100g],
        ]
        return {
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
          ingredientNames: entry.ingredientNames,
          nutrientsPer100g:
            previous?.nutrientsPer100g ??
            Object.fromEntries(
              macroPairs.filter((pair): pair is [string, number] => pair[1] !== null),
            ),
          hasImputedValues: previous?.hasImputedValues ?? false,
          exchange: entry.exchange,
        }
      }),
    )
    await yieldToBrowser()
  }
  await setStoredVersion(version, 'searchVersion')

  // Yeni veri geldiğinde bellekteki Orama indeksi bayatlar, yeniden kurulacak.
  oramaIndexPromise = null
}

let nutrientPackPromise: Promise<void> | null = null

async function ensureNutrientPackLoaded(): Promise<void> {
  if (!nutrientPackPromise) {
    nutrientPackPromise = downloadAndStoreNutrientPack().catch((error: unknown) => {
      nutrientPackPromise = null
      throw error
    })
  }
  return nutrientPackPromise
}

async function downloadAndStoreNutrientPack(): Promise<void> {
  await ensureIndexLoaded()
  const storedVersion = await getStoredVersion('nutrientVersion')
  const hasUsableCache = storedVersion !== null && (await dexieDb.foods.count()) > 0

  let currentVersion: string
  try {
    currentVersion = await fetchCurrentVersion()
  } catch (error: unknown) {
    if (hasUsableCache) return
    throw error
  }
  if (hasUsableCache && currentVersion === storedVersion) return

  let response: Response
  try {
    response = await fetch(`/api/foods/nutrients?v=${encodeURIComponent(currentVersion)}`)
  } catch (error: unknown) {
    if (hasUsableCache) return
    throw error
  }
  if (!response.ok) {
    if (hasUsableCache) return
    throw new Error(`Tam besin öğesi paketi indirilemedi: ${response.status}`)
  }

  const { version, entries } = (await response.json()) as {
    version: string
    entries: Array<{
      id: string
      nutrientsPer100g: Record<string, number>
      hasImputedValues: boolean
    }>
  }
  for (let start = 0; start < entries.length; start += INDEX_WRITE_BATCH_SIZE) {
    const batch = entries.slice(start, start + INDEX_WRITE_BATCH_SIZE)
    const rows = await dexieDb.foods.bulkGet(batch.map((entry) => entry.id))
    const updates: FoodIndexRow[] = []
    for (let index = 0; index < batch.length; index += 1) {
      const row = rows[index]
      const detail = batch[index]
      if (!row || !detail) continue
      updates.push({
        ...row,
        nutrientsPer100g: detail.nutrientsPer100g,
        hasImputedValues: detail.hasImputedValues,
      })
    }
    if (updates.length > 0) await dexieDb.foods.bulkPut(updates)
    await yieldToBrowser()
  }
  await setStoredVersion(version, 'nutrientVersion')
}

// GitHub issue #26 / Prompt 5.4 — mikro besin öğesi listesinin metadata'sı
// (ad/birim/isCore), önbellekten (initFoodIndex çağrılmış olmalı).
export async function getNutrientDefinitions(): Promise<NutrientDefRow[]> {
  if (isNativeShell()) return []
  // NOT: orderBy() Dexie'de INDEKSLİ bir alan gerektirir (sadece 'code'
  // indeksli, bkz. FoodIndexDb.version(2)) — sortBy() indeks gerektirmez,
  // JS tarafında sıralar. ~60 satırlık küçük bir tablo için maliyeti önemsiz.
  return dexieDb.nutrientDefs.toCollection().sortBy('displayOrder')
}

async function buildOramaIndex(): Promise<OramaDb> {
  const oramaDb = await create({ schema: oramaSchema })
  const rows = await dexieDb.foods.toArray()
  for (let start = 0; start < rows.length; start += ORAMA_BUILD_BATCH_SIZE) {
    const batch = rows.slice(start, start + ORAMA_BUILD_BATCH_SIZE)
    await insertMultiple(
      oramaDb,
      batch.map((row) => ({ id: row.id, nameTr: row.nameTr, searchText: row.searchText })),
    )
    await yieldToBrowser()
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
  if (isNativeShell()) return
  await ensureIndexLoaded()
  // Orama yalnız ilk gerçek aramada, tam mikro besin paketi yalnız besin
  // panelinde hazırlanır. Uygulama kabuğunu açmak bu ağır işleri tetiklemez.
}

// GitHub issue #61 — "Dexie BOŞKEN yapılan İLK açılışta kalemler 'Bilinmeyen
// besin' olarak kalıyor" hatasının çözüm noktası (semptomu #60'ın
// apps/e2e/scripts/capture-plan-editor.ts dosyasında ayrıntılı yazılmıştı).
//
// KÖK NEDEN: `getFoodIndexEntriesByIds` yalnızca Dexie'de O AN ne varsa onu
// okur. Plan editörü mount olurken `initFoodIndex()`i BEKLEMEDEN çağırıyor,
// store'un `resolveFoodMacros()`u ise hemen çalışıp BOŞ bir tablo okuyordu;
// indeks ~20-30 sn sonra Dexie'ye yazıldığında hiçbir şey yeniden
// denenmiyordu.
//
// ÇÖZÜM: "indeks hazır olduğunda" diye BEKLENEBİLİR bir nokta. initFoodIndex
// ile AYNI `indexLoadPromise`i paylaşır (yani ek bir indirme TETİKLEMEZ,
// zaten başlamışsa ona katılır; hiç başlamamışsa başlatır — çağrı sırası
// artık önemli değil). Orama arama indeksini KURMAZ: bu fonksiyonun
// çağıranları (bkz. plan-editor-store.ts, nutrient-panel.tsx) id ile doğrudan
// okuma yapar, tam metin aramaya ihtiyaçları yoktur.
//
// Hata YUTULUR (loglanır): indeks indirilemese bile Dexie'de ESKİ bir kopya
// olabilir ve onu okumak hiç okumamaktan iyidir — çağıranlar her koşulda
// devam edebilsin diye bu fonksiyon reject ETMEZ.
export async function whenFoodIndexReady(): Promise<void> {
  if (isNativeShell()) return
  try {
    await ensureIndexLoaded()
    await ensureNutrientPackLoaded()
  } catch (error: unknown) {
    console.error('[food-index] besin indeksi hazırlanamadı:', error)
  }
}

// Ad, porsiyon, makro, değişim ve yemek bileşenleri için yalnızca hafif arama
// paketini bekler. Planın ilk görünümü tam mikro besin paketine bağlı kalmaz.
export async function whenFoodSearchIndexReady(): Promise<void> {
  if (isNativeShell()) return
  try {
    await ensureIndexLoaded()
  } catch (error: unknown) {
    console.error('[food-index] arama indeksi hazırlanamadı:', error)
  }
}

// GitHub issue #25 — plan editörünün öğün toplamı hesabı (bkz.
// lib/plan-nutrients.ts) plan_items.foodId'lere karşılık gelen besin
// öğesi değerlerini AĞA ÇIKMADAN okumak için bu fonksiyonu kullanır.
// searchFoodsOffline'ın AKSİNE bir arama sorgusu YOK, sadece bilinen
// id'lerin doğrudan Dexie'den toplu okunması (initFoodIndex çağrılmış
// olmalı — bkz. çağıranlar).
export async function getFoodIndexEntriesByIds(ids: string[]): Promise<Map<string, FoodIndexRow>> {
  if (ids.length === 0) return new Map()
  if (isNativeShell()) {
    const rows = await invoke<NativeFoodEntry[]>('get_local_food_entries', { ids })
    return new Map(rows.map((entry) => [entry.id, nativeFoodEntryToRow(entry)]))
  }
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
  ingredientNames: string[]
}

export interface DesktopFoodCatalogExport {
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
    defaultPortionLabel: string | null
    defaultPortionGrams: number | null
  }>
}

/** Şifreli masaüstü kasası için yalnız arama/plan yazımında gereken hafif katalog. */
export async function exportDesktopFoodCatalog(): Promise<DesktopFoodCatalogExport> {
  await ensureIndexLoaded()
  const [version, rows] = await Promise.all([
    getStoredVersion('searchVersion'),
    dexieDb.foods.toArray(),
  ])
  if (!version || rows.length === 0) throw new Error('Besin kataloğu henüz hazır değil.')
  return {
    version,
    entries: rows.map((row) => ({
      id: row.id,
      nameTr: row.nameTr,
      searchText: row.searchText,
      groupNameTr: row.groupNameTr,
      kcalPer100g: row.kcalPer100g,
      proteinPer100g: row.proteinPer100g,
      carbPer100g: row.carbPer100g,
      fatPer100g: row.fatPer100g,
      defaultPortionLabel: row.defaultPortionLabel,
      defaultPortionGrams: row.defaultPortionGrams,
    })),
  }
}

const P95_WARN_THRESHOLD_MS = 20

export async function searchFoodsOffline(
  query: string,
  limit = 20,
): Promise<{ hits: FoodSearchHit[]; elapsedMs: number }> {
  const start = performance.now()

  if (isNativeShell()) {
    const entries = await invoke<NativeFoodEntry[]>('search_local_foods', { query, limit })
    return {
      hits: entries.map((entry) => {
        const row = nativeFoodEntryToRow(entry)
        return {
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
          ingredientNames: row.ingredientNames ?? [],
        }
      }),
      elapsedMs: performance.now() - start,
    }
  }

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
      ingredientNames: row.ingredientNames ?? [],
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

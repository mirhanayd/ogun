import { create, insertMultiple, search } from '@orama/orama'
import { normalizeSearchText } from './normalize'

// GitHub issue #24 / Prompt 5.2 GÖREV 4 — "10.000 besinli indeksle test et,
// p95 < 20ms hedefini tutmuyorsa konsola uyar". packages/nutrition-core/src/
// benchmark.ts (`tsx src/benchmark.ts`) ile AYNI desen: sentetik veri, gerçek
// DB'ye/tarayıcıya bağımlı değil.
//
// BİLEREK Dexie DEĞİL, doğrudan Orama kullanılıyor: Dexie bir IndexedDB
// sarmalayıcısı, IndexedDB tarayıcı dışında (Node/tsx) mevcut değil — ama
// arama gecikmesinin asıl kaynağı zaten Orama'nın kendisi (bkz.
// lib/food-index.ts searchFoodsOffline: Dexie sadece sonuç id'lerinden satırı
// çekiyor, o da bellek-içi bir Map/tablo taraması kadar ucuz). Bu yüzden
// Orama'yı izole ölçmek, gerçek dünya p95'inin güvenilir bir alt/yaklaşık
// tahminini verir; tam uçtan uca (Dexie dahil) ölçüm tarayıcıda
// apps/web/src/app/dev/food-search sayfasındaki geliştirme rozetinden izlenir.

const oramaSchema = { id: 'string', nameTr: 'string', searchText: 'string' } as const

const FOOD_GROUPS = ['Sebzeler', 'Meyveler', 'Tahıllar', 'Et ve Et Ürünleri', 'Süt Ürünleri', 'Baklagiller', 'Yağlar', 'İçecekler']

const NAME_PARTS_A = ['tavuk', 'dana', 'kuzu', 'mercimek', 'nohut', 'pirinç', 'bulgur', 'elma', 'muz', 'ıspanak', 'domates', 'yoğurt', 'peynir', 'zeytinyağı', 'süt']
const NAME_PARTS_B = ['göğsü', 'kıyma', 'çorbası', 'salatası', 'pilavı', 'ızgara', 'haşlama', 'kavurma', 'püresi', 'suyu', 'dilim', '']

function buildSyntheticFoodName(index: number): string {
  const a = NAME_PARTS_A[index % NAME_PARTS_A.length]
  const b = NAME_PARTS_B[Math.floor(index / NAME_PARTS_A.length) % NAME_PARTS_B.length]
  return `${a} ${b} ${index}`.trim()
}

async function buildSyntheticIndex(size: number) {
  const oramaDb = await create({ schema: oramaSchema })
  const entries = Array.from({ length: size }, (_, index) => {
    const nameTr = buildSyntheticFoodName(index)
    return {
      id: `food-${index}`,
      nameTr,
      searchText: normalizeSearchText(nameTr),
      groupNameTr: FOOD_GROUPS[index % FOOD_GROUPS.length],
    }
  })
  await insertMultiple(
    oramaDb,
    entries.map((entry) => ({ id: entry.id, nameTr: entry.nameTr, searchText: entry.searchText })),
  )
  return oramaDb
}

function percentile(sortedMs: number[], p: number): number {
  if (sortedMs.length === 0) return 0
  const rank = Math.ceil((p / 100) * sortedMs.length) - 1
  return sortedMs[Math.min(Math.max(rank, 0), sortedMs.length - 1)]!
}

const P95_TARGET_MS = 20

async function runBenchmark(indexSize: number, queryCount: number) {
  const oramaDb = await buildSyntheticIndex(indexSize)

  const queries = Array.from({ length: queryCount }, (_, i) => {
    const term = NAME_PARTS_A[i % NAME_PARTS_A.length]!
    // Kısmi/gerçekçi yazım senaryosu: bazı sorgular tek harfle başlar
    // (kullanıcı daha yazarken), bazıları tam kelime.
    return i % 3 === 0 ? term.slice(0, 2) : term
  })

  const timings: number[] = []
  for (const term of queries) {
    const start = performance.now()
    await search(oramaDb, { term: normalizeSearchText(term), limit: 20 })
    timings.push(performance.now() - start)
  }

  timings.sort((a, b) => a - b)
  const p50 = percentile(timings, 50)
  const p95 = percentile(timings, 95)
  const p99 = percentile(timings, 99)
  const max = timings[timings.length - 1] ?? 0

  console.log(
    `${indexSize.toLocaleString('tr-TR')} besinlik indeks — ${queryCount} sorgu: ` +
      `p50=${p50.toFixed(2)}ms p95=${p95.toFixed(2)}ms p99=${p99.toFixed(2)}ms max=${max.toFixed(2)}ms`,
  )

  if (p95 > P95_TARGET_MS) {
    console.warn(
      `[food-search-benchmark] p95 hedefi TUTMADI: ${p95.toFixed(2)}ms > ${P95_TARGET_MS}ms ` +
        `(${indexSize} besinlik indeks). Bkz. GitHub issue #24 GÖREV 4.`,
    )
  } else {
    console.log(`[food-search-benchmark] p95 hedefi tutuyor (< ${P95_TARGET_MS}ms).`)
  }

  return { p50, p95, p99, max }
}

// Top-level await KULLANILMIYOR: apps/web CommonJS modül olarak derleniyor
// (packages/nutrition-core'un aksine "type": "module" değil) — tsx bu
// dosyayı cjs çıktısına dönüştürürken top-level await'i reddediyor.
async function main() {
  console.log('--- food search benchmark (Orama, sentetik veri) ---')
  await runBenchmark(1_000, 500)
  await runBenchmark(10_000, 500)
  await runBenchmark(20_000, 200)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})

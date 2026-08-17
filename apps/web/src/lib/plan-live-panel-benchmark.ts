import { buildLivePanelData, type FoodNutrientLookup, type LivePanelInput } from './plan-live-panel'
import type { DraftDay, DraftItem, DraftMeal } from '@/app/(app)/danisanlar/[id]/planlar/[planId]/plan-editor-store'

// GitHub issue #45 / Prompt 8.1, GÖREV 2 — "Plan editörü için özel ölçüm:
// ... panel güncelleme p95". apps/web/src/lib/food-search-benchmark.ts
// (GitHub #24) İLE AYNI desen: sentetik veri, gerçek DB/tarayıcıya bağımlı
// değil, `tsx` ile doğrudan çalışır (bkz. package.json
// "benchmark:nutrient-panel"). #26'nın nutrient-panel.tsx'te kod-içi
// tuttuğu LIVE_PANEL_TARGET_MS = 50 hedefiyle KARŞILAŞTIRILABİLİR olsun diye
// AYNI sabit burada da referans alınıyor.
//
// buildLivePanelData SAF bir fonksiyon (Dexie'ye bağımlı değil, bkz. o
// dosyanın dosya başı notu) — bu da food-search-benchmark.ts'in Orama'yı
// izole ölçmesiyle AYNI gerekçe: gerçek dünya p95'inin güvenilir bir
// alt/yaklaşık tahmini (Dexie okuması ayrı, ağ dışı bir maliyet).

const NUTRIENT_CODES = [
  'ENERC_KCAL',
  'PROCNT',
  'CHOCDF',
  'FAT',
  'FASAT',
  'FIBTG',
  'SUGAR',
  'NA',
  'FE',
  'CA',
  'ZN',
  'VITB12',
  'FOL',
  'VITD',
  'VITC',
]

function buildSyntheticFoodLookup(count: number): Map<string, FoodNutrientLookup> {
  const map = new Map<string, FoodNutrientLookup>()
  for (let i = 0; i < count; i++) {
    const nutrientsPer100g: Record<string, number> = {}
    for (const code of NUTRIENT_CODES) {
      // Deterministik ama besin başına farklı, sıfır olmayan değerler.
      nutrientsPer100g[code] = ((i + 1) * (NUTRIENT_CODES.indexOf(code) + 1)) % 97 || 1
    }
    map.set(`food-${i}`, {
      id: `food-${i}`,
      nameTr: `Sentetik besin ${i}`,
      nutrientsPer100g,
      hasImputedValues: i % 5 === 0,
    })
  }
  return map
}

// Roadmap'in "3 öğün × 8 kalem × 4 alternatif" ölçeğini (nutrition-core
// Prompt 2.4 GÖREV 2 — packages/nutrition-core benchmark'ı) plan editörü
// tarafında BÜYÜTEREK kullanıyoruz: gerçekçi bir günlük plan 6 öğün × ~6
// kalem civarındadır (bkz. plan-editor-store.ts ensurePlanBootstrapped'in
// varsayılan 6 öğünü), burada onun ~2 katı bir "ağır plan" senaryosuyla
// üst sınırı ölçüyoruz.
function buildSyntheticDay(mealCount: number, itemsPerMeal: number, foodCount: number): DraftDay {
  const meals: DraftMeal[] = Array.from({ length: mealCount }, (_, mealIndex) => {
    const items: DraftItem[] = Array.from({ length: itemsPerMeal }, (_, itemIndex) => ({
      id: `item-${mealIndex}-${itemIndex}`,
      mealId: `meal-${mealIndex}`,
      foodId: `food-${(mealIndex * itemsPerMeal + itemIndex) % foodCount}`,
      recipeId: null,
      freeText: null,
      amountGrams: 100 + itemIndex * 10,
      note: null,
      sortOrder: itemIndex,
      isOptional: false,
      alternatives: [],
    }))
    return {
      id: `meal-${mealIndex}`,
      dayId: 'day-1',
      mealType: 'öğle',
      time: null,
      name: `Öğün ${mealIndex}`,
      sortOrder: mealIndex,
      items,
    }
  })
  return { id: 'day-1', dayNumber: 1, dayLabel: null, meals }
}

function percentile(sortedMs: number[], p: number): number {
  if (sortedMs.length === 0) return 0
  const rank = Math.ceil((p / 100) * sortedMs.length) - 1
  return sortedMs[Math.min(Math.max(rank, 0), sortedMs.length - 1)]!
}

const P95_TARGET_MS = 50 // nutrient-panel.tsx LIVE_PANEL_TARGET_MS ile AYNI

function runBenchmark(label: string, input: LivePanelInput, iterations: number) {
  const timings: number[] = []
  // İlk çağrı JIT ısınması içerir, ölçüme dahil edilmez.
  buildLivePanelData(input)
  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    buildLivePanelData(input)
    timings.push(performance.now() - start)
  }
  timings.sort((a, b) => a - b)
  const p50 = percentile(timings, 50)
  const p95 = percentile(timings, 95)
  const p99 = percentile(timings, 99)
  const max = timings[timings.length - 1] ?? 0

  console.log(
    `${label} — ${iterations} tekrar: p50=${p50.toFixed(3)}ms p95=${p95.toFixed(3)}ms ` +
      `p99=${p99.toFixed(3)}ms max=${max.toFixed(3)}ms`,
  )
  if (p95 > P95_TARGET_MS) {
    console.warn(
      `[plan-live-panel-benchmark] p95 hedefi TUTMADI: ${p95.toFixed(3)}ms > ${P95_TARGET_MS}ms (${label}). ` +
        `Bkz. GitHub issue #26 / #45.`,
    )
  } else {
    console.log(`[plan-live-panel-benchmark] p95 hedefi tutuyor (< ${P95_TARGET_MS}ms).`)
  }
  return { p50, p95, p99, max }
}

// Top-level await KULLANILMIYOR — food-search-benchmark.ts'teki AYNI
// gerekçe (tsx, apps/web'in CommonJS derlemesi).
function main() {
  console.log('--- plan editörü canlı panel benchmarkı (buildLivePanelData, sentetik veri) ---')

  const foodLookup = buildSyntheticFoodLookup(200)
  const coreNutrientCodes = NUTRIENT_CODES

  // Senaryo 1: gerçekçi tek günlük plan (6 öğün × 6 kalem).
  runBenchmark(
    'gerçekçi plan (6 öğün × 6 kalem)',
    {
      days: [buildSyntheticDay(6, 6, 200)],
      foodLookup,
      targetKcal: 1800,
      reference: null,
      coreNutrientCodes,
    },
    500,
  )

  // Senaryo 2: ağır plan (roadmap Prompt 2.4'ün "3 öğün × 8 kalem × 4
  // alternatif" ölçüsünün ~2 katı yoğunlukta, 6 öğün × 12 kalem).
  runBenchmark(
    'ağır plan (6 öğün × 12 kalem)',
    {
      days: [buildSyntheticDay(6, 12, 200)],
      foodLookup,
      targetKcal: 1800,
      reference: null,
      coreNutrientCodes,
    },
    500,
  )

  // Senaryo 3: çok günlük (haftalık) plan — 7 gün × 6 öğün × 6 kalem.
  runBenchmark(
    'haftalık plan (7 gün × 6 öğün × 6 kalem)',
    {
      days: Array.from({ length: 7 }, (_, i) => ({ ...buildSyntheticDay(6, 6, 200), id: `day-${i}`, dayNumber: i + 1 })),
      foodLookup,
      targetKcal: 1800,
      reference: null,
      coreNutrientCodes,
    },
    200,
  )
}

main()

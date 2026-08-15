import { sql } from 'drizzle-orm'
import { db } from '@ogun/db'
import {
  NUTRIENT,
  calculateMacroDistribution,
  calculateMealEnergyDistribution,
  calculatePlan,
  compareEnergyToAtwater,
  generatePlanWarnings,
  type DailyPlan,
  type FoodReference,
  type Meal,
} from '@ogun/nutrition-core'

// nutrition-core paketi DB'ye bağımlı DEĞİL (Prompt 2.1) — bu script onu
// gerçek DB verisiyle uçtan uca doğrulamak için @ogun/etl içinde yaşıyor,
// zaten hem @ogun/db hem @ogun/nutrition-core'a bağımlı olan tek paket bu.
// Çalıştır: pnpm etl:e2e

const SAMPLE_SIZE = 20

interface FoodRow {
  [key: string]: unknown
  id: string
  name_tr: string
  has_imputed: boolean
  nutrients: Record<string, string>
}

async function fetchRandomFoods(): Promise<FoodReference[]> {
  const rows = await db.execute<FoodRow>(sql`
    SELECT
      f.id,
      f.name_tr,
      bool_or(fn.is_imputed) AS has_imputed,
      jsonb_object_agg(n.code, fn.value_per_100g) AS nutrients
    FROM foods f
    JOIN food_nutrients fn ON fn.food_id = f.id AND fn.is_preferred = true
    JOIN nutrients n ON n.id = fn.nutrient_id
    WHERE f.id IN (SELECT id FROM foods ORDER BY random() LIMIT ${SAMPLE_SIZE})
    GROUP BY f.id, f.name_tr
  `)

  return rows.map((row) => ({
    id: row.id,
    nameTr: row.name_tr,
    hasImputedValues: row.has_imputed,
    nutrientsPer100g: Object.fromEntries(
      Object.entries(row.nutrients).map(([code, value]) => [code, Number(value)]),
    ),
  }))
}

function buildPlan(foodPool: FoodReference[]): DailyPlan {
  const mealDefs: Array<{ name: string; count: number; grams: number }> = [
    { name: 'Kahvaltı', count: 6, grams: 100 },
    { name: 'Öğle', count: 7, grams: 150 },
    { name: 'Akşam', count: 7, grams: 150 },
  ]

  let cursor = 0
  const meals: Meal[] = mealDefs.map(({ name, count, grams }) => {
    const items = Array.from({ length: count }, () => {
      const food = foodPool[cursor % foodPool.length]
      cursor++
      return { food: food!, grams }
    })
    return { name, items }
  })

  return { meals }
}

async function main() {
  console.log(`\n--- Uçtan Uca Plan Doğrulaması (${SAMPLE_SIZE} rastgele besin) ---\n`)

  const foodPool = await fetchRandomFoods()
  if (foodPool.length === 0) {
    console.log('DB boş görünüyor — önce pnpm etl:bls ve pnpm etl:usda çalıştırılmalı.')
    return
  }
  console.log(`${foodPool.length} besin çekildi.`)

  const plan = buildPlan(foodPool)
  const result = calculatePlan(plan)

  console.log('\n-- Öğün bazlı enerji --')
  for (const share of calculateMealEnergyDistribution(result)) {
    console.log(`  ${share.mealName}: ${share.kcal.toFixed(0)} kcal (%${share.percentOfDailyTotal.toFixed(1)})`)
  }

  console.log(`\n-- Günlük toplam --`)
  console.log(`  Enerji: ${(result.totalNutrients[NUTRIENT.ENERGY_KCAL] ?? 0).toFixed(0)} kcal`)
  console.log(`  Protein: ${(result.totalNutrients[NUTRIENT.PROTEIN] ?? 0).toFixed(1)} g`)
  console.log(`  Yağ: ${(result.totalNutrients[NUTRIENT.FAT] ?? 0).toFixed(1)} g`)
  console.log(`  Karbonhidrat: ${(result.totalNutrients[NUTRIENT.CARB] ?? 0).toFixed(1)} g`)

  const macros = calculateMacroDistribution(result.totalNutrients)
  console.log(
    `\n-- Makro dağılımı -- Protein %${macros.proteinPercent.toFixed(1)} · ` +
      `Yağ %${macros.fatPercent.toFixed(1)} · Karbonhidrat %${macros.carbPercent.toFixed(1)}`,
  )

  console.log('\n-- Atwater sapma kontrolü (besin başına) --')
  let suspiciousCount = 0
  for (const food of foodPool) {
    const check = compareEnergyToAtwater(food.nutrientsPer100g)
    if (check.isSuspicious) {
      suspiciousCount++
      console.log(
        `  ⚠ ${food.nameTr}: beyan ${check.declaredKcal.toFixed(0)} kcal, ` +
          `hesaplanan ${check.calculatedKcal.toFixed(0)} kcal (sapma %${(check.deviationRatio * 100).toFixed(1)})`,
      )
    }
  }
  console.log(`  ${suspiciousCount}/${foodPool.length} besin %10 sapma eşiğini aştı.`)

  console.log('\n-- Uyarı kanalı --')
  const normalWarnings = generatePlanWarnings(plan, result, { sex: 'female' })
  console.log(`  Normal senaryo (kadın, açık hedefi yok): ${normalWarnings.length} uyarı`)
  for (const warning of normalWarnings) {
    console.log(`    [${warning.severity}] ${warning.code}: ${warning.message}`)
  }

  const aggressiveDeficitWarnings = generatePlanWarnings(plan, result, {
    sex: 'female',
    targetDailyDeficitKcal: 1200,
  })
  const excessiveLoss = aggressiveDeficitWarnings.find((w) => w.code === 'EXCESSIVE_WEEKLY_LOSS')
  console.log(
    `  Agresif açık senaryosu (1200 kcal/gün açık): ${
      excessiveLoss ? 'EXCESSIVE_WEEKLY_LOSS uyarısı doğru şekilde tetiklendi ✓' : 'BEKLENMEDİK: uyarı tetiklenmedi ✗'
    }`,
  )

  console.log('\n--- Doğrulama tamamlandı ---\n')
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => db.$client.end())

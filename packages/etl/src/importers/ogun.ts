import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { count, eq } from 'drizzle-orm'
import Papa from 'papaparse'
import {
  dataSources,
  foodIngredients,
  foodNutrients,
  foodPortions,
  foods,
  nutrients,
} from '@ogun/db/schema'
import { resolvePreferredSources } from '../lib/merge'
import { normalizeSearchText } from '../lib/normalize'
import { upsertFoodNutrients, type FoodNutrientUpsertInput } from '../lib/upsert'
import {
  atwaterDeviationPercent,
  getOgunCorrection,
  perPortionToPer100g,
  turkishDisplayName,
} from './ogun-data'
import { ogunNutrientMap } from './ogun-nutrient-map'

const EXPECTED = {
  recipes: 119,
  ingredients: 708,
  nutrients: 2_380,
  nutrientsPerRecipe: 20,
} as const

const REQUIRED_FILES = [
  '01_recipes.csv',
  '02_ingredients.csv',
  '03_nutrition_per_portion.csv',
  '04_nutrition_adults.csv',
  '05_nutrition_children_adolescents.csv',
  '07_quality_flags.csv',
] as const

const ADULT_PERCENT_COLUMNS = [
  'female_19_50_pct',
  'female_51_64_pct',
  'female_65_plus_pct',
  'male_19_50_pct',
  'male_51_64_pct',
  'male_65_plus_pct',
] as const

const CHILD_PERCENT_COLUMNS = [
  'girl_2_3_pct',
  'girl_4_6_pct',
  'girl_7_10_pct',
  'girl_11_14_pct',
  'girl_15_18_pct',
  'boy_2_3_pct',
  'boy_4_6_pct',
  'boy_7_10_pct',
  'boy_11_14_pct',
  'boy_15_18_pct',
] as const

const OGUN_CITATION =
  'Kullanıcı tarafından sağlanan “tarifler-ve-değerler” görsel derlemesi ' +
  '(378 sayfa); OCR yapılandırması ve kalite bayrakları, 2026-08-24.'

interface RecipeRow extends Record<string, string> {
  recipe_order: string
  recipe_page: string
  category: string
  recipe_title: string
  portion_count: string
  portion_weight_g: string
  portion_measure_tool: string
  ingredient_count_parsed: string
}

interface IngredientRow extends Record<string, string> {
  recipe_order: string
  ingredient_order: string
  ingredient_name_ocr: string
  measure_ocr: string
  amount_g: string
  source_line_raw: string
}

interface NutritionRow extends Record<string, string> {
  recipe_order: string
  recipe_title: string
  nutrient_code: string
  unit: string
  amount_per_portion: string
  amount_selection_basis: string
}

interface PercentageRow extends Record<string, string> {
  recipe_order: string
  nutrient_code: string
  amount_per_portion_best: string
}

interface QualityFlagRow extends Record<string, string> {
  severity: string
  recipe_order: string
  issue: string
  detail: string
}

function resolveDataDir(): string {
  return path.resolve(process.cwd(), 'data/ogun')
}

function parseArgs(argv: string[]) {
  const auditOnly = argv.includes('--audit-only')
  const dirArg = argv.find((arg) => arg.startsWith('--dir='))
  return {
    auditOnly,
    dataDir: dirArg ? path.resolve(dirArg.slice('--dir='.length)) : resolveDataDir(),
  }
}

function readCsv<T extends Record<string, string>>(
  filePath: string,
  requiredColumns: readonly string[],
): T[] {
  const result = Papa.parse<T>(readFileSync(filePath, 'utf8'), {
    header: true,
    skipEmptyLines: true,
  })
  if (result.errors.length > 0) {
    throw new Error(
      `${path.basename(filePath)} CSV hatası: ${result.errors
        .slice(0, 5)
        .map((error) => `satır ${error.row ?? '?'}: ${error.message}`)
        .join('; ')}`,
    )
  }
  const fields = result.meta.fields ?? []
  const missing = requiredColumns.filter((column) => !fields.includes(column))
  if (missing.length > 0) {
    throw new Error(`${path.basename(filePath)} eksik sütunlar: ${missing.join(', ')}`)
  }
  return result.data
}

function parseFinite(value: string, label: string): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new Error(`${label} sayısal değil: ${value}`)
  return parsed
}

function assertCount(name: string, actual: number, expected: number): void {
  if (actual !== expected) throw new Error(`${name}: ${actual} satır; beklenen ${expected}.`)
}

function groupCount<T>(rows: T[], key: (row: T) => string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const row of rows) counts.set(key(row), (counts.get(key(row)) ?? 0) + 1)
  return counts
}

function correctedAmount(row: NutritionRow): { value: number; correctionReason: string | null } {
  const recipeOrder = parseFinite(row.recipe_order, 'recipe_order')
  const correction = getOgunCorrection(recipeOrder, row.nutrient_code)
  return correction
    ? { value: correction.valuePerPortion, correctionReason: correction.reason }
    : {
        value: parseFinite(row.amount_per_portion, `${row.recipe_title}/${row.nutrient_code}`),
        correctionReason: null,
      }
}

function auditPercentages(
  rows: PercentageRow[],
  columns: readonly string[],
): { populated: number; missing: number; zeroForPositiveAmount: number; over500: number } {
  let populated = 0
  let missing = 0
  let zeroForPositiveAmount = 0
  let over500 = 0
  for (const row of rows) {
    const amount = Number(row.amount_per_portion_best)
    for (const column of columns) {
      const raw = row[column]?.trim()
      if (!raw) {
        missing += 1
        continue
      }
      const value = Number(raw)
      if (!Number.isFinite(value)) throw new Error(`${column} sayısal değil: ${raw}`)
      populated += 1
      if (amount > 0 && value === 0) zeroForPositiveAmount += 1
      if (value > 500) over500 += 1
    }
  }
  return { populated, missing, zeroForPositiveAmount, over500 }
}

function assertPercentageCoverage(
  label: string,
  rows: PercentageRow[],
  recipeOrders: Set<string>,
): void {
  const counts = groupCount(rows, (row) => row.recipe_order)
  for (const recipeOrder of recipeOrders) {
    const actual = counts.get(recipeOrder) ?? 0
    if (actual !== EXPECTED.nutrientsPerRecipe) {
      throw new Error(`${label}/${recipeOrder}: 20 yerine ${actual} besin satırı.`)
    }
  }
  for (const row of rows) {
    if (!recipeOrders.has(row.recipe_order)) {
      throw new Error(`${label}: yetim recipe_order=${row.recipe_order}`)
    }
  }
}

function auditDataset(input: {
  recipes: RecipeRow[]
  ingredients: IngredientRow[]
  nutrition: NutritionRow[]
  adults: PercentageRow[]
  children: PercentageRow[]
  flags: QualityFlagRow[]
}) {
  assertCount('Yemek', input.recipes.length, EXPECTED.recipes)
  assertCount('Malzeme', input.ingredients.length, EXPECTED.ingredients)
  assertCount('Porsiyon besin değeri', input.nutrition.length, EXPECTED.nutrients)
  assertCount('Yetişkin besin değeri', input.adults.length, EXPECTED.nutrients)
  assertCount('Çocuk/adölesan besin değeri', input.children.length, EXPECTED.nutrients)

  const recipeOrders = new Set(input.recipes.map((row) => row.recipe_order))
  if (recipeOrders.size !== input.recipes.length)
    throw new Error('Tekrarlanan recipe_order bulundu.')
  assertPercentageCoverage('Yetişkin yüzdeleri', input.adults, recipeOrders)
  assertPercentageCoverage('Çocuk/adölesan yüzdeleri', input.children, recipeOrders)

  const ingredientCounts = groupCount(input.ingredients, (row) => row.recipe_order)
  for (const recipe of input.recipes) {
    const expected = parseFinite(recipe.ingredient_count_parsed, 'ingredient_count_parsed')
    const actual = ingredientCounts.get(recipe.recipe_order) ?? 0
    if (actual !== expected) {
      throw new Error(`${recipe.recipe_title}: malzeme sayısı ${actual}; tarifte ${expected}.`)
    }
    const portionWeight = parseFinite(
      recipe.portion_weight_g,
      `${recipe.recipe_title}/portion_weight_g`,
    )
    if (portionWeight <= 0)
      throw new Error(`${recipe.recipe_title}: porsiyon ağırlığı pozitif değil.`)
  }
  for (const ingredient of input.ingredients) {
    if (!recipeOrders.has(ingredient.recipe_order)) {
      throw new Error(`Yetim malzeme satırı: recipe_order=${ingredient.recipe_order}`)
    }
  }

  const mappedCodes = new Map(ogunNutrientMap.map((mapping) => [mapping.sourceCode, mapping]))
  const nutritionCounts = groupCount(input.nutrition, (row) => row.recipe_order)
  const nutritionByRecipe = new Map<string, Map<string, number>>()
  for (const row of input.nutrition) {
    const mapping = mappedCodes.get(row.nutrient_code)
    if (!mapping) throw new Error(`Eşlenmemiş besin öğesi: ${row.nutrient_code}`)
    if (row.unit !== mapping.sourceUnit) {
      throw new Error(
        `${row.recipe_title}/${row.nutrient_code}: birim ${row.unit}; beklenen ${mapping.sourceUnit}.`,
      )
    }
    const { value } = correctedAmount(row)
    if (value < 0) throw new Error(`${row.recipe_title}/${row.nutrient_code}: negatif değer.`)
    const values = nutritionByRecipe.get(row.recipe_order) ?? new Map<string, number>()
    if (values.has(row.nutrient_code)) {
      throw new Error(`${row.recipe_title}: yinelenen ${row.nutrient_code} satırı.`)
    }
    values.set(row.nutrient_code, value)
    nutritionByRecipe.set(row.recipe_order, values)
  }
  for (const recipe of input.recipes) {
    if ((nutritionCounts.get(recipe.recipe_order) ?? 0) !== EXPECTED.nutrientsPerRecipe) {
      throw new Error(
        `${recipe.recipe_title}: 20 yerine ${nutritionCounts.get(recipe.recipe_order) ?? 0} besin değeri.`,
      )
    }
  }

  const atwaterResults = input.recipes.map((recipe) => {
    const values = nutritionByRecipe.get(recipe.recipe_order)!
    const deviation = atwaterDeviationPercent({
      energyKcal: values.get('energy_kcal')!,
      carbohydrateG: values.get('carbohydrate_g')!,
      proteinG: values.get('protein_g')!,
      fatG: values.get('fat_g')!,
    })
    return { recipeOrder: recipe.recipe_order, name: recipe.recipe_title, deviation }
  })
  const atwaterFailures = atwaterResults.filter((result) => result.deviation > 10)
  if (atwaterFailures.length > 0) {
    throw new Error(
      `Atwater sapması %10 üstü: ${atwaterFailures
        .map((item) => `${item.recipeOrder}/${item.name}=%${item.deviation.toFixed(1)}`)
        .join(', ')}`,
    )
  }

  const unknownHighFlags = input.flags.filter(
    (flag) => flag.severity === 'HIGH' && flag.issue !== 'child_adolescent_nutrition_page_missing',
  )
  if (unknownHighFlags.length > 0) {
    throw new Error(`Bilinmeyen HIGH kalite bayrağı: ${unknownHighFlags[0]!.issue}`)
  }

  return {
    maxAtwaterDeviation: Math.max(...atwaterResults.map((result) => result.deviation)),
    adultPercentages: auditPercentages(input.adults, ADULT_PERCENT_COLUMNS),
    childPercentages: auditPercentages(input.children, CHILD_PERCENT_COLUMNS),
    highFlags: input.flags.filter((flag) => flag.severity === 'HIGH').length,
    mediumFlags: input.flags.filter((flag) => flag.severity === 'MEDIUM').length,
    lowFlags: input.flags.filter((flag) => flag.severity === 'LOW').length,
  }
}

async function main() {
  const { auditOnly, dataDir } = parseArgs(process.argv.slice(2))
  const missing = REQUIRED_FILES.filter((file) => !existsSync(path.join(dataDir, file)))
  if (missing.length > 0) throw new Error(`Öğün CSV dosyaları eksik: ${missing.join(', ')}`)

  const recipes = readCsv<RecipeRow>(path.join(dataDir, '01_recipes.csv'), [
    'recipe_order',
    'recipe_title',
    'category',
    'portion_weight_g',
    'portion_measure_tool',
    'ingredient_count_parsed',
  ])
  const ingredients = readCsv<IngredientRow>(path.join(dataDir, '02_ingredients.csv'), [
    'recipe_order',
    'ingredient_name_ocr',
    'amount_g',
  ])
  const nutrition = readCsv<NutritionRow>(path.join(dataDir, '03_nutrition_per_portion.csv'), [
    'recipe_order',
    'recipe_title',
    'nutrient_code',
    'unit',
    'amount_per_portion',
    'amount_selection_basis',
  ])
  const adults = readCsv<PercentageRow>(path.join(dataDir, '04_nutrition_adults.csv'), [
    'recipe_order',
    'nutrient_code',
    'amount_per_portion_best',
    ...ADULT_PERCENT_COLUMNS,
  ])
  const children = readCsv<PercentageRow>(
    path.join(dataDir, '05_nutrition_children_adolescents.csv'),
    ['recipe_order', 'nutrient_code', 'amount_per_portion_best', ...CHILD_PERCENT_COLUMNS],
  )
  const flags = readCsv<QualityFlagRow>(path.join(dataDir, '07_quality_flags.csv'), [
    'severity',
    'recipe_order',
    'issue',
    'detail',
  ])

  const audit = auditDataset({ recipes, ingredients, nutrition, adults, children, flags })
  console.log('\n--- Öğün CSV Kalite Denetimi ---')
  console.log(`Yemek: ${recipes.length}`)
  console.log(`Malzeme: ${ingredients.length}`)
  console.log(`Besin değeri: ${nutrition.length}`)
  console.log(`Kanıtlı OCR düzeltmesi: 14`)
  console.log(`En yüksek Atwater sapması: %${audit.maxAtwaterDeviation.toFixed(1)}`)
  console.log(
    `Kalite bayrakları: HIGH=${audit.highFlags}, MEDIUM=${audit.mediumFlags}, LOW=${audit.lowFlags}`,
  )
  console.log(
    `Yetişkin yüzde hücreleri: dolu=${audit.adultPercentages.populated}, ` +
      `boş=${audit.adultPercentages.missing}, OCR-sıfır=${audit.adultPercentages.zeroForPositiveAmount}, ` +
      `>%500=${audit.adultPercentages.over500}`,
  )
  console.log(
    `Çocuk/adölesan yüzde hücreleri: dolu=${audit.childPercentages.populated}, ` +
      `boş=${audit.childPercentages.missing}, OCR-sıfır=${audit.childPercentages.zeroForPositiveAmount}, ` +
      `>%500=${audit.childPercentages.over500}`,
  )
  if (auditOnly) return

  const { db } = await import('@ogun/db')
  try {
    const [source] = await db
      .insert(dataSources)
      .values({
        code: 'OGUN',
        name: 'Öğün Türk Yemekleri',
        version: '2026-08-24',
        license: null,
        citation: OGUN_CITATION,
        priority: 30,
      })
      .onConflictDoUpdate({
        target: dataSources.code,
        set: {
          name: 'Öğün Türk Yemekleri',
          version: '2026-08-24',
          citation: OGUN_CITATION,
          priority: 30,
        },
      })
      .returning()
    if (!source) throw new Error('OGUN data_sources kaydı oluşturulamadı.')

    await db
      .insert(nutrients)
      .values(
        ogunNutrientMap.map((mapping, index) => ({
          code: mapping.nutrientCode,
          nameTr: mapping.nameTr,
          nameEn: mapping.nameEn,
          unit: mapping.unit,
          category: mapping.category,
          displayOrder: 200 + index,
          isCore: false,
        })),
      )
      .onConflictDoNothing({ target: nutrients.code })

    const nutrientRows = await db.select().from(nutrients)
    const nutrientIdByCode = new Map(nutrientRows.map((row) => [row.code, row.id]))
    const nutritionByRecipe = new Map<string, NutritionRow[]>()
    for (const row of nutrition) {
      const list = nutritionByRecipe.get(row.recipe_order) ?? []
      list.push(row)
      nutritionByRecipe.set(row.recipe_order, list)
    }
    const ingredientsByRecipe = new Map<string, IngredientRow[]>()
    for (const row of ingredients) {
      const list = ingredientsByRecipe.get(row.recipe_order) ?? []
      list.push(row)
      ingredientsByRecipe.set(row.recipe_order, list)
    }

    const seenTitles = new Map<string, number>()
    let importedNutrients = 0
    let importedPortions = 0

    for (const recipe of recipes) {
      const baseName = turkishDisplayName(recipe.recipe_title)
      const occurrence = (seenTitles.get(baseName) ?? 0) + 1
      seenTitles.set(baseName, occurrence)
      const nameTr = occurrence === 1 ? baseName : `${baseName} (${occurrence}. Tarif)`
      const groupNameTr = turkishDisplayName(recipe.category)
      const sourceCode = `OGUN-${recipe.recipe_order.padStart(3, '0')}`
      const portionWeightG = parseFinite(recipe.portion_weight_g, `${nameTr}/portion_weight_g`)

      const [food] = await db
        .insert(foods)
        .values({
          sourceId: source.id,
          sourceCode,
          nameTr,
          nameEn: null,
          searchText: normalizeSearchText(`${nameTr} ${groupNameTr}`),
          groupCode: `OGUN-${normalizeSearchText(recipe.category).replaceAll(' ', '_').toUpperCase()}`,
          groupNameTr,
          preparation: null,
          isVerified: false,
          needsTranslation: false,
        })
        .onConflictDoUpdate({
          target: [foods.sourceId, foods.sourceCode],
          set: {
            nameTr,
            searchText: normalizeSearchText(`${nameTr} ${groupNameTr}`),
            groupNameTr,
            needsTranslation: false,
            isVerified: false,
          },
        })
        .returning()
      if (!food) throw new Error(`${nameTr}: foods kaydı oluşturulamadı.`)

      const nutrientBatch: FoodNutrientUpsertInput[] = []
      for (const row of nutritionByRecipe.get(recipe.recipe_order) ?? []) {
        const mapping = ogunNutrientMap.find((item) => item.sourceCode === row.nutrient_code)!
        const nutrientId = nutrientIdByCode.get(mapping.nutrientCode)
        if (!nutrientId) throw new Error(`nutrients tablosunda ${mapping.nutrientCode} yok.`)
        const { value, correctionReason } = correctedAmount(row)
        nutrientBatch.push({
          foodId: food.id,
          nutrientId,
          valuePer100g: perPortionToPer100g(value, portionWeightG).toFixed(4),
          sourceId: source.id,
          isImputed: true,
          note: [
            `source-per-portion:${value}`,
            `portion-g:${portionWeightG}`,
            `basis:${row.amount_selection_basis}`,
            'ocr-normalized-per-100g-v1',
            correctionReason ? `correction:${correctionReason}` : null,
          ]
            .filter(Boolean)
            .join('; '),
        })
      }
      await upsertFoodNutrients(db, nutrientBatch)
      importedNutrients += nutrientBatch.length

      await db.delete(foodPortions).where(eq(foodPortions.foodId, food.id))
      await db.insert(foodPortions).values({
        foodId: food.id,
        label: recipe.portion_measure_tool.trim() || '1 porsiyon',
        grams: portionWeightG.toFixed(2),
        isDefault: true,
        sortOrder: 0,
      })
      importedPortions += 1

      await db.delete(foodIngredients).where(eq(foodIngredients.foodId, food.id))
      const ingredientBatch = (ingredientsByRecipe.get(recipe.recipe_order) ?? []).map((row) => ({
        foodId: food.id,
        nameTr: row.ingredient_name_ocr.trim(),
        normalizedName: normalizeSearchText(row.ingredient_name_ocr),
        amountGrams: row.amount_g.trim() ? Number(row.amount_g).toFixed(2) : null,
        measure: row.measure_ocr.trim() || null,
        sourceLine: row.source_line_raw.trim() || null,
        sortOrder: Number(row.ingredient_order) - 1,
      }))
      if (ingredientBatch.length > 0) await db.insert(foodIngredients).values(ingredientBatch)

      if (Number(recipe.recipe_order) % 25 === 0) {
        console.log(`... ${recipe.recipe_order}/${recipes.length} yemek işlendi`)
      }
    }

    await resolvePreferredSources(db)

    const [foodTotal] = await db
      .select({ value: count() })
      .from(foods)
      .where(eq(foods.sourceId, source.id))
    const [nutrientTotal] = await db
      .select({ value: count() })
      .from(foodNutrients)
      .where(eq(foodNutrients.sourceId, source.id))

    console.log('\n--- Öğün Türk Yemekleri İçe Aktarma Özeti ---')
    console.log(`Besin: ${foodTotal?.value ?? 0}`)
    console.log(`Besin öğesi değeri: ${nutrientTotal?.value ?? 0}`)
    console.log(`Bu çalıştırmada yazılan değer: ${importedNutrients}`)
    console.log(`Porsiyon: ${importedPortions}`)
    console.log(
      'Yaş/cinsiyet yüzdeleri besin miktarı değildir; kalite denetiminde tutuldu, DB miktarına karıştırılmadı.',
    )
  } finally {
    await db.$client.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

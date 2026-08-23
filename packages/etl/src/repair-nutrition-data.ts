import { createReadStream, existsSync } from 'node:fs'
import path from 'node:path'
import { eq, inArray, sql } from 'drizzle-orm'
import Papa from 'papaparse'
import { db } from '@ogun/db'
import { dataSources, foods, nutrients } from '@ogun/db/schema'
import { resolvePreferredSources } from './lib/merge'
import { upsertFoodNutrients, type FoodNutrientUpsertInput } from './lib/upsert'

const BLS_UNIT_MARKER = 'unit-normalized:µg-to-mg-v1'
const ENERGY_PREFERENCE = new Map([
  ['1008', 10],
  ['2047', 20],
  ['2048', 30],
])

interface EnergyCsvRow {
  fdc_id: string
  nutrient_id: string
  amount: string
}

interface SelectedEnergy {
  amount: number
  nutrientId: string
  preference: number
}

function parseArgs() {
  const apply = process.argv.includes('--apply')
  const dirArg = process.argv.find((arg) => arg.startsWith('--dir='))
  return {
    apply,
    dataDir: dirArg
      ? path.resolve(dirArg.slice('--dir='.length))
      : path.resolve(process.cwd(), 'data/usda'),
  }
}

function streamFoundationEnergy(
  filePath: string,
  foundationCodes: Set<string>,
): Promise<Map<string, SelectedEnergy>> {
  return new Promise((resolve, reject) => {
    const selected = new Map<string, SelectedEnergy>()
    let rowCount = 0
    const fileStream = createReadStream(filePath)
    const parseStream = Papa.parse(Papa.NODE_STREAM_INPUT, { header: true, skipEmptyLines: true })

    parseStream.on('data', (row: EnergyCsvRow) => {
      rowCount += 1
      const preference = ENERGY_PREFERENCE.get(row.nutrient_id)
      if (preference === undefined || !foundationCodes.has(row.fdc_id)) return
      const amount = Number.parseFloat(row.amount)
      if (!Number.isFinite(amount)) return
      const current = selected.get(row.fdc_id)
      if (!current || preference >= current.preference) {
        selected.set(row.fdc_id, { amount, nutrientId: row.nutrient_id, preference })
      }
      if (rowCount % 5_000_000 === 0) {
        console.log(`${rowCount.toLocaleString('tr-TR')} USDA besin öğesi satırı tarandı...`)
      }
    })
    parseStream.on('end', () => resolve(selected))
    parseStream.on('error', reject)
    fileStream.on('error', reject)
    fileStream.pipe(parseStream)
  })
}

async function main() {
  const { apply, dataDir } = parseArgs()
  const foodNutrientPath = path.join(dataDir, 'food_nutrient.csv')
  if (!existsSync(foodNutrientPath)) {
    throw new Error(`USDA food_nutrient.csv bulunamadı: ${foodNutrientPath}`)
  }

  const [blsSource] = await db
    .select()
    .from(dataSources)
    .where(eq(dataSources.code, 'BLS4'))
    .limit(1)
  const [foundationSource] = await db
    .select()
    .from(dataSources)
    .where(eq(dataSources.code, 'USDA_FDN'))
    .limit(1)
  const [energyNutrient] = await db
    .select()
    .from(nutrients)
    .where(eq(nutrients.code, 'ENERC_KCAL'))
    .limit(1)
  if (!blsSource || !foundationSource || !energyNutrient) {
    throw new Error('BLS4, USDA_FDN veya ENERC_KCAL veritabanı kaydı bulunamadı.')
  }

  const foundationFoods = await db
    .select({ id: foods.id, sourceCode: foods.sourceCode })
    .from(foods)
    .where(eq(foods.sourceId, foundationSource.id))
  const foodBySourceCode = new Map(foundationFoods.map((food) => [food.sourceCode, food]))

  console.log(`${foundationFoods.length} Foundation besini için USDA enerji satırları taranıyor...`)
  const selectedEnergy = await streamFoundationEnergy(
    foodNutrientPath,
    new Set(foodBySourceCode.keys()),
  )
  console.log(`${selectedEnergy.size} Foundation besininde uygun kcal değeri bulundu.`)

  const blsPending = await db.execute<{ count: number } & Record<string, unknown>>(sql`
    SELECT count(*)::int AS count
    FROM food_nutrients fn
    JOIN nutrients n ON n.id = fn.nutrient_id
    WHERE fn.source_id = ${blsSource.id}
      AND n.code IN ('VITB6A', 'CU', 'MN')
      AND coalesce(fn.note, '') NOT LIKE ${`%${BLS_UNIT_MARKER}%`}
  `)
  console.log(`${blsPending[0]?.count ?? 0} BLS µg→mg satırı düzeltilecek.`)

  if (!apply) {
    console.log('Kuru çalışma tamamlandı. Yazmak için --apply kullanın.')
    return
  }

  await db.execute(sql`
    WITH corrected AS (
      UPDATE food_nutrients fn
      SET value_per_100g = fn.value_per_100g / 1000,
          note = concat_ws('; ', nullif(fn.note, ''), cast(${BLS_UNIT_MARKER} AS text))
      FROM nutrients n
      WHERE n.id = fn.nutrient_id
        AND fn.source_id = ${blsSource.id}
        AND n.code IN ('VITB6A', 'CU', 'MN')
        AND coalesce(fn.note, '') NOT LIKE ${`%${BLS_UNIT_MARKER}%`}
      RETURNING fn.food_id
    )
    UPDATE foods f
    SET updated_at = now()
    WHERE f.id IN (SELECT food_id FROM corrected)
  `)

  const upserts: FoodNutrientUpsertInput[] = []
  const touchedFoundationFoodIds: string[] = []
  for (const [sourceCode, selected] of selectedEnergy) {
    const food = foodBySourceCode.get(sourceCode)
    if (!food) continue
    upserts.push({
      foodId: food.id,
      nutrientId: energyNutrient.id,
      valuePer100g: selected.amount.toString(),
      sourceId: foundationSource.id,
      isImputed: false,
      note: `USDA FDC energy nutrient ${selected.nutrientId}`,
    })
    touchedFoundationFoodIds.push(food.id)
  }

  for (let index = 0; index < upserts.length; index += 100) {
    await upsertFoodNutrients(db, upserts.slice(index, index + 100))
  }
  for (let index = 0; index < touchedFoundationFoodIds.length; index += 500) {
    await db
      .update(foods)
      .set({ updatedAt: new Date() })
      .where(inArray(foods.id, touchedFoundationFoodIds.slice(index, index + 500)))
  }
  await resolvePreferredSources(db)

  console.log(
    'Besin indeksi önbelleğini yenilemek için etkilenen foods.updated_at değerleri güncellendi.',
  )
  console.log('Beslenme verisi onarımı tamamlandı.')
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})

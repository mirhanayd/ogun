import { sql } from 'drizzle-orm'
import { db } from '@ogun/db'
import { getAllFoodIndexEntries, getFoodIndexVersion } from '@ogun/db/queries'

interface CountRow {
  foods: number
  nutrients: number
  preferredNutrients: number
}

async function main() {
  const [databaseTotals] = await db.execute<{ foods: number }>(
    sql`select count(*)::int as foods from foods`,
  )
  const sourceTotals = await db.execute<{
    code: string
    foods: number
    nutrients: number
    preferredNutrients: number
  }>(sql`
    select ds.code,
           count(distinct f.id)::int as foods,
           count(fn.food_id)::int as nutrients,
           count(fn.food_id) filter (where fn.is_preferred)::int as "preferredNutrients"
      from data_sources ds
      left join foods f on f.source_id = ds.id
      left join food_nutrients fn on fn.food_id = f.id and fn.source_id = ds.id
     where ds.code in ('OGUN', 'BLS4', 'USDA_FDN', 'USDA_SR')
     group by ds.code
     order by ds.code
  `)
  const [portionTotals] = await db.execute<{ portions: number }>(sql`
    select count(*)::int as portions
      from food_portions fp
      join foods f on f.id = fp.food_id
      join data_sources ds on ds.id = f.source_id
     where ds.code = 'OGUN'
  `)
  const [coverage] = await db.execute<{ minNutrients: number; maxNutrients: number }>(sql`
    select min(nutrient_count)::int as "minNutrients",
           max(nutrient_count)::int as "maxNutrients"
      from (
        select f.id, count(fn.food_id) as nutrient_count
          from foods f
          join data_sources ds on ds.id = f.source_id
          left join food_nutrients fn on fn.food_id = f.id
         where ds.code = 'OGUN'
         group by f.id
      ) counts
  `)
  const samples = await db.execute<{
    id: string
    sourceCode: string
    nameTr: string
    nutrientCode: string
    valuePer100g: string
    unit: string
  }>(sql`
    select f.id,
           f.source_code as "sourceCode",
           f.name_tr as "nameTr",
           n.code as "nutrientCode",
           round(fn.value_per_100g::numeric, 2)::text as "valuePer100g",
           n.unit
      from foods f
      join data_sources ds on ds.id = f.source_id
      join food_nutrients fn on fn.food_id = f.id
      join nutrients n on n.id = fn.nutrient_id
     where ds.code = 'OGUN'
       and f.source_code in ('OGUN-001', 'OGUN-060', 'OGUN-119')
       and n.code in ('ENERC_KCAL', 'PROCNT', 'CHOCDF', 'FAT', 'VITC', 'FE', 'FAN3')
     order by f.source_code, n.code
  `)
  const ogunFoodIds = await db.execute<{ id: string }>(sql`
    select f.id
      from foods f
      join data_sources ds on ds.id = f.source_id
     where ds.code = 'OGUN'
  `)
  const [foodIndex, foodIndexVersion] = await Promise.all([
    getAllFoodIndexEntries(db),
    getFoodIndexVersion(db),
  ])
  const indexedIds = new Set(foodIndex.map((entry) => entry.id))
  const indexedOgunFoods = ogunFoodIds.filter((food) => indexedIds.has(food.id)).length

  const ogun = sourceTotals.find((row) => row.code === 'OGUN') as CountRow | undefined
  const failures = [
    ogun?.foods !== 119 ? `OGUN foods=${ogun?.foods ?? 'yok'} (beklenen 119)` : null,
    ogun?.nutrients !== 2_380
      ? `OGUN food_nutrients=${ogun?.nutrients ?? 'yok'} (beklenen 2380)`
      : null,
    ogun?.preferredNutrients !== 2_380
      ? `OGUN preferred nutrients=${ogun?.preferredNutrients ?? 'yok'} (beklenen 2380)`
      : null,
    portionTotals?.portions !== 119
      ? `OGUN portions=${portionTotals?.portions ?? 'yok'} (beklenen 119)`
      : null,
    coverage?.minNutrients !== 20 || coverage.maxNutrients !== 20
      ? `Besin kapsamı min=${coverage?.minNutrients}, max=${coverage?.maxNutrients} (beklenen 20/20)`
      : null,
    indexedOgunFoods !== 119
      ? `İstemci besin indeksindeki OGUN kaydı=${indexedOgunFoods} (beklenen 119)`
      : null,
  ].filter(Boolean)

  console.log(
    JSON.stringify(
      {
        databaseTotals,
        sourceTotals,
        portionTotals,
        coverage,
        foodIndex: {
          version: foodIndexVersion,
          totalFoods: foodIndex.length,
          indexedOgunFoods,
        },
        samples,
      },
      null,
      2,
    ),
  )
  if (failures.length > 0) throw new Error(failures.join('; '))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$client.end()
  })

import { sql } from 'drizzle-orm'
import { db } from '@ogun/db'

interface CoverageRow extends Record<string, unknown> {
  source_code: string
  nutrient_code: string
  nutrient_name: string
  unit: string
  category: string
  food_count: number
  source_food_count: number
  coverage_pct: number
}

interface EnergyAuditRow extends Record<string, unknown> {
  source_code: string
  source_food_count: number
  kcal_food_count: number
  complete_macro_count: number
  suspicious_count: number
  suspicious_pct: number
  median_deviation_pct: number
  p95_deviation_pct: number
  impossible_kcal_count: number
}

interface UnitAuditRow extends Record<string, unknown> {
  source_code: string
  nutrient_code: string
  unit: string
  min_value: number
  median_value: number
  p95_value: number
  max_value: number
}

async function main() {
  const coverage = await db.execute<CoverageRow>(sql`
    WITH source_totals AS (
      SELECT source_id, count(*)::int AS food_count
      FROM foods
      GROUP BY source_id
    )
    SELECT
      ds.code::text AS source_code,
      n.code AS nutrient_code,
      n.name_tr AS nutrient_name,
      n.unit::text AS unit,
      n.category::text AS category,
      count(DISTINCT fn.food_id)::int AS food_count,
      st.food_count::int AS source_food_count,
      round(count(DISTINCT fn.food_id)::numeric * 100 / nullif(st.food_count, 0), 1)::float8 AS coverage_pct
    FROM food_nutrients fn
    JOIN foods f ON f.id = fn.food_id
    JOIN data_sources ds ON ds.id = f.source_id
    JOIN nutrients n ON n.id = fn.nutrient_id
    JOIN source_totals st ON st.source_id = f.source_id
    WHERE fn.is_preferred = true
    GROUP BY ds.code, n.code, n.name_tr, n.unit, n.category, n.display_order, st.food_count
    ORDER BY ds.code, n.display_order
  `)

  const energyAudit = await db.execute<EnergyAuditRow>(sql`
    WITH nutrient_values AS (
      SELECT
        f.id AS food_id,
        ds.code::text AS source_code,
        max(fn.value_per_100g::float8) FILTER (WHERE n.code = 'ENERC_KCAL') AS kcal,
        max(fn.value_per_100g::float8) FILTER (WHERE n.code = 'PROCNT') AS protein,
        max(fn.value_per_100g::float8) FILTER (WHERE n.code = 'CHOCDF') AS carbohydrate,
        max(fn.value_per_100g::float8) FILTER (WHERE n.code = 'FAT') AS fat,
        max(fn.value_per_100g::float8) FILTER (WHERE n.code = 'ALC') AS alcohol
      FROM foods f
      JOIN data_sources ds ON ds.id = f.source_id
      LEFT JOIN food_nutrients fn ON fn.food_id = f.id AND fn.is_preferred = true
      LEFT JOIN nutrients n ON n.id = fn.nutrient_id
      GROUP BY f.id, ds.code
    ), calculated AS (
      SELECT
        *,
        protein * 4 + carbohydrate * 4 + fat * 9 + coalesce(alcohol, 0) * 7 AS atwater_kcal,
        abs((protein * 4 + carbohydrate * 4 + fat * 9 + coalesce(alcohol, 0) * 7) - kcal)
          / nullif(kcal, 0) AS deviation
      FROM nutrient_values
    )
    SELECT
      source_code,
      count(*)::int AS source_food_count,
      count(kcal)::int AS kcal_food_count,
      count(*) FILTER (
        WHERE kcal IS NOT NULL AND protein IS NOT NULL AND carbohydrate IS NOT NULL AND fat IS NOT NULL
      )::int AS complete_macro_count,
      count(*) FILTER (WHERE deviation > 0.10)::int AS suspicious_count,
      round(
        count(*) FILTER (WHERE deviation > 0.10)::numeric * 100 /
        nullif(count(*) FILTER (WHERE deviation IS NOT NULL), 0),
        1
      )::float8 AS suspicious_pct,
      round((percentile_cont(0.5) WITHIN GROUP (ORDER BY deviation) FILTER (WHERE deviation IS NOT NULL) * 100)::numeric, 1)::float8 AS median_deviation_pct,
      round((percentile_cont(0.95) WITHIN GROUP (ORDER BY deviation) FILTER (WHERE deviation IS NOT NULL) * 100)::numeric, 1)::float8 AS p95_deviation_pct,
      count(*) FILTER (WHERE kcal < 0 OR kcal > 1000)::int AS impossible_kcal_count
    FROM calculated
    GROUP BY source_code
    ORDER BY source_code
  `)

  const unitAudit = await db.execute<UnitAuditRow>(sql`
    SELECT
      ds.code::text AS source_code,
      n.code AS nutrient_code,
      n.unit::text AS unit,
      min(fn.value_per_100g::float8)::float8 AS min_value,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY fn.value_per_100g::float8)::float8 AS median_value,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY fn.value_per_100g::float8)::float8 AS p95_value,
      max(fn.value_per_100g::float8)::float8 AS max_value
    FROM food_nutrients fn
    JOIN foods f ON f.id = fn.food_id
    JOIN data_sources ds ON ds.id = f.source_id
    JOIN nutrients n ON n.id = fn.nutrient_id
    WHERE fn.is_preferred = true
      AND n.code IN ('VITB6A', 'CU', 'MN')
    GROUP BY ds.code, n.code, n.unit
    ORDER BY ds.code, n.code
  `)

  const microCoverage = coverage.filter(
    (row) => row.category === 'vitamin' || row.category === 'mineral',
  )
  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        microCoverage,
        energyAudit,
        unitAudit,
      },
      null,
      2,
    ),
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$client.end()
  })

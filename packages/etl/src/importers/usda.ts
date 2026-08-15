import { createReadStream, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { and, eq, inArray } from 'drizzle-orm'
import Papa from 'papaparse'
import { dataSources, foodNutrients, foodPortions, foods, nutrients } from '@ogun/db/schema'
import { resolvePreferredSources } from '../lib/merge'
import { normalizeSearchText } from '../lib/normalize'
import { upsertFoodNutrients, type FoodNutrientUpsertInput } from '../lib/upsert'
import { usdaNutrientMap } from './usda-nutrient-map'

// GÖREV 1: sadece Foundation Foods + SR Legacy. Branded (~3 GB) ve FNDDS v2'de.
const USDA_DATA_TYPES = ['foundation_food', 'sr_legacy_food'] as const
type UsdaDataType = (typeof USDA_DATA_TYPES)[number]

const USDA_CITATION =
  'U.S. Department of Agriculture, Agricultural Research Service. FoodData Central, fdc.nal.usda.gov.'
const USDA_LICENSE = 'Public Domain (U.S. Government Work)'

const REQUIRED_FILES = ['food.csv', 'food_nutrient.csv', 'nutrient.csv', 'food_portion.csv', 'measure_unit.csv']

interface FoodRow {
  fdc_id: string
  data_type: string
  description: string
}
interface NutrientRow {
  id: string
  name: string
  unit_name: string
}
interface FoodNutrientRow {
  fdc_id: string
  nutrient_id: string
  amount: string
}
interface MeasureUnitRow {
  id: string
  name: string
}
interface FoodPortionRow {
  fdc_id: string
  seq_num: string
  amount: string
  measure_unit_id: string
  portion_description: string
  modifier: string
  gram_weight: string
}

function resolveDataDir() {
  return path.resolve(process.cwd(), 'data/usda')
}

function parseArgs(argv: string[]) {
  const listNutrients = argv.includes('--list-nutrients')
  const dirArg = argv.find((arg) => arg.startsWith('--dir='))
  const dataDir = dirArg ? dirArg.slice('--dir='.length) : resolveDataDir()
  return { listNutrients, dataDir }
}

function readCsv<T>(filePath: string): T[] {
  const content = readFileSync(filePath, 'utf8')
  const result = Papa.parse<T>(content, { header: true, skipEmptyLines: true })
  return result.data
}

// USDA'nın "Full Download" paketinde food.csv ve özellikle food_nutrient.csv
// TÜM veri tiplerini (branded dahil) tek dosyada birleştirir — food_nutrient.csv
// tek başına birkaç GB olabilir. Tamamını belleğe okumak yerine satır satır
// akıtıp yalnızca `keep()` true dönen satırları tutuyoruz.
function streamCsvFiltered<T extends object>(
  filePath: string,
  requiredColumns: string[],
  fileName: string,
  keep: (row: T) => boolean,
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const kept: T[] = []
    let headersChecked = false
    let rowCount = 0

    const fileStream = createReadStream(filePath)
    const parseStream = Papa.parse(Papa.NODE_STREAM_INPUT, { header: true, skipEmptyLines: true })

    parseStream.on('data', (row: T) => {
      if (!headersChecked) {
        assertColumns(Object.keys(row), requiredColumns, fileName)
        headersChecked = true
      }
      rowCount += 1
      if (keep(row)) kept.push(row)
      if (rowCount % 1_000_000 === 0) {
        console.log(`... ${fileName}: ${rowCount.toLocaleString('tr-TR')} satır tarandı, ${kept.length.toLocaleString('tr-TR')} tutuldu`)
      }
    })
    parseStream.on('end', () => resolve(kept))
    parseStream.on('error', (error: Error) => reject(error))
    fileStream.on('error', (error: Error) => reject(error))
    fileStream.pipe(parseStream)
  })
}

// USDA'nın kendi CSV şeması yıllardır stabil olsa da, dosyayı görmeden emin
// olamayacağımız için gerçek başlıkları burada doğruluyoruz (BLS'teki
// BLS_COLUMNS kontrolüyle aynı disiplin) — beklenmeyen bir şema sessizce
// yanlış veri üretmesin, açık hatayla dursun.
function assertColumns(headers: string[], required: string[], fileName: string) {
  const missing = required.filter((col) => !headers.includes(col))
  if (missing.length > 0) {
    throw new Error(
      `${fileName} beklenen sütunları içermiyor: ${missing.join(', ')}.\n` +
        `Bulunan sütunlar: ${headers.join(', ')}`,
    )
  }
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const num = typeof value === 'number' ? value : Number.parseFloat(String(value))
  return Number.isNaN(num) ? null : num
}

// Basit Atwater enerji hesabı — tam sürümü packages/nutrition-core'da kurulacak.
function calculateAtwaterEnergyKcal(protein: number, carb: number, fat: number): number {
  return protein * 4 + carb * 4 + fat * 9
}

async function main() {
  const { listNutrients, dataDir } = parseArgs(process.argv.slice(2))

  const missingFiles = REQUIRED_FILES.filter((file) => !existsSync(path.join(dataDir, file)))
  if (missingFiles.length > 0) {
    console.error(`USDA CSV dosyaları eksik: ${missingFiles.join(', ')}`)
    console.error(`Beklenen konum: ${dataDir} (fdc.nal.usda.gov Download Data sayfasından indir)`)
    process.exit(1)
  }

  if (listNutrients) {
    const nutrientRows = readCsv<NutrientRow>(path.join(dataDir, 'nutrient.csv'))
    console.log(`${nutrientRows.length} besin öğesi bulundu:\n`)
    for (const row of nutrientRows) {
      console.log(`${row.id}\t${row.name}\t[${row.unit_name}]`)
    }
    return
  }

  // DATABASE_URL gerektiren bağlantı, sadece burada (--list-nutrients modundan
  // sonra) kurulur.
  const { db } = await import('@ogun/db')

  try {
    console.log('food.csv taranıyor (Foundation Foods + SR Legacy filtreleniyor)...')
    const foodRows = await streamCsvFiltered<FoodRow>(
      path.join(dataDir, 'food.csv'),
      ['fdc_id', 'data_type', 'description'],
      'food.csv',
      (row) => (USDA_DATA_TYPES as readonly string[]).includes(row.data_type),
    )
    if (foodRows.length === 0) {
      console.warn('food.csv içinde foundation_food/sr_legacy_food satırı bulunamadı.')
      return
    }
    const keptFdcIds = new Set(foodRows.map((row) => row.fdc_id))
    console.log(`food.csv: ${foodRows.length.toLocaleString('tr-TR')} besin tutuldu.`)

    const nutrientRows = readCsv<NutrientRow>(path.join(dataDir, 'nutrient.csv'))
    const nutrientNameById = new Map(nutrientRows.map((row) => [row.id, row.name]))

    console.log('food_nutrient.csv taranıyor (bu dosya büyük olabilir, biraz sürebilir)...')
    const foodNutrientRows = await streamCsvFiltered<FoodNutrientRow>(
      path.join(dataDir, 'food_nutrient.csv'),
      ['fdc_id', 'nutrient_id', 'amount'],
      'food_nutrient.csv',
      (row) => keptFdcIds.has(row.fdc_id),
    )
    console.log(`food_nutrient.csv: ${foodNutrientRows.length.toLocaleString('tr-TR')} değer tutuldu.`)
    const foodNutrientsByFdcId = new Map<string, FoodNutrientRow[]>()
    for (const row of foodNutrientRows) {
      const list = foodNutrientsByFdcId.get(row.fdc_id) ?? []
      list.push(row)
      foodNutrientsByFdcId.set(row.fdc_id, list)
    }

    const measureUnitRows = readCsv<MeasureUnitRow>(path.join(dataDir, 'measure_unit.csv'))
    const measureUnitNameById = new Map(measureUnitRows.map((row) => [row.id, row.name]))

    const allFoodPortionRows = readCsv<FoodPortionRow>(path.join(dataDir, 'food_portion.csv'))
    const portionsByFdcId = new Map<string, FoodPortionRow[]>()
    for (const row of allFoodPortionRows) {
      if (!keptFdcIds.has(row.fdc_id)) continue
      const list = portionsByFdcId.get(row.fdc_id) ?? []
      list.push(row)
      portionsByFdcId.set(row.fdc_id, list)
    }

    // Foundation Foods ve SR Legacy, öncelik sırasında farklı basamaklarda
    // duran iki ayrı alt kaynak olarak kaydedilir (bkz. packages/db/src/seed/data-sources.ts).
    const [fdnSource] = await db
      .insert(dataSources)
      .values({
        code: 'USDA_FDN',
        name: 'USDA FoodData Central — Foundation Foods',
        license: USDA_LICENSE,
        citation: USDA_CITATION,
        priority: 60,
      })
      .onConflictDoUpdate({
        target: dataSources.code,
        set: { citation: USDA_CITATION, license: USDA_LICENSE },
      })
      .returning()
    const [srSource] = await db
      .insert(dataSources)
      .values({
        code: 'USDA_SR',
        name: 'USDA FoodData Central — SR Legacy',
        license: USDA_LICENSE,
        citation: USDA_CITATION,
        priority: 40,
      })
      .onConflictDoUpdate({
        target: dataSources.code,
        set: { citation: USDA_CITATION, license: USDA_LICENSE },
      })
      .returning()
    if (!fdnSource || !srSource) {
      throw new Error('data_sources kayıtları oluşturulamadı.')
    }
    const sourceIdByDataType: Record<UsdaDataType, string> = {
      foundation_food: fdnSource.id,
      sr_legacy_food: srSource.id,
    }

    const ourNutrientRows = await db.select().from(nutrients)
    const nutrientIdByCode = new Map(ourNutrientRows.map((n) => [n.code, n.id]))
    const nutrientCodeByUsdaId = new Map(
      usdaNutrientMap.map((mapping) => [mapping.usdaNutrientId.toString(), mapping.nutrientCode]),
    )

    const usedUsdaIds = new Set(foodNutrientRows.map((row) => row.nutrient_id))
    const unmapped = new Set(
      [...usedUsdaIds]
        .filter((id) => !nutrientCodeByUsdaId.has(id))
        .map((id) => `${id} (${nutrientNameById.get(id) ?? '?'})`),
    )

    let foodCount = 0
    let nutrientValueCount = 0
    let imputedCount = 0
    let portionCount = 0
    let duplicateNutrientRowCount = 0
    const importedFoodIds: string[] = []

    for (const row of foodRows) {
      // streamCsvFiltered zaten data_type'ı USDA_DATA_TYPES ile sınırladı.
      const sourceId = sourceIdByDataType[row.data_type as UsdaDataType]

      const nameEn = row.description.trim() || null
      const nameTr = nameEn ?? row.fdc_id

      const [food] = await db
        .insert(foods)
        .values({
          sourceId,
          sourceCode: row.fdc_id,
          nameTr,
          nameEn,
          searchText: normalizeSearchText(nameTr),
          needsTranslation: true,
          isVerified: false,
        })
        .onConflictDoUpdate({
          target: [foods.sourceId, foods.sourceCode],
          set: { nameTr, nameEn, searchText: normalizeSearchText(nameTr), needsTranslation: true },
        })
        .returning()
      if (!food) continue

      foodCount += 1
      importedFoodIds.push(food.id)

      // NOT: BLS'teki gibi değer bazlı "Datenherkunft" yok — food_nutrient_derivation.csv
      // bu içe aktarmanın kapsamı dışında (roadmap sadece 5 dosyayı istiyor). Bu yüzden
      // kaba bir kaynak seviyesi sınıflandırma kullanılıyor: Foundation Foods programı
      // doğrudan laboratuvar analizine odaklı → tahmini değil; SR Legacy daha eski ve
      // karma kökenli (literatür/hesaplama içerebilir) → tahmini kabul edilir.
      const isImputed = row.data_type !== 'foundation_food'

      // food_nutrient.csv bazı besinlerde aynı nutrient_id için birden fazla satır
      // içerebiliyor (özellikle SR Legacy'de) — Map ile dedupe ediyoruz (son satır
      // kazanır), yoksa tek INSERT'te aynı (foodId,nutrientId,sourceId) anahtarını
      // iki kez hedeflemek Postgres'te hataya yol açar.
      const nutrientBatchByNutrientId = new Map<string, FoodNutrientUpsertInput>()
      let duplicateNutrientRows = 0
      for (const fnRow of foodNutrientsByFdcId.get(row.fdc_id) ?? []) {
        const nutrientCode = nutrientCodeByUsdaId.get(fnRow.nutrient_id)
        if (!nutrientCode) continue
        const nutrientId = nutrientIdByCode.get(nutrientCode)
        if (!nutrientId) {
          console.warn(`nutrients tablosunda bulunamayan kod: ${nutrientCode}`)
          continue
        }
        const amount = toNumber(fnRow.amount)
        if (amount === null) continue

        if (nutrientBatchByNutrientId.has(nutrientId)) duplicateNutrientRows += 1
        nutrientBatchByNutrientId.set(nutrientId, {
          foodId: food.id,
          nutrientId,
          valuePer100g: amount.toString(),
          sourceId,
          isImputed,
        })
      }
      duplicateNutrientRowCount += duplicateNutrientRows
      if (isImputed) imputedCount += nutrientBatchByNutrientId.size

      const nutrientBatch = Array.from(nutrientBatchByNutrientId.values())
      await upsertFoodNutrients(db, nutrientBatch)
      nutrientValueCount += nutrientBatch.length

      // Porsiyonları yeniden hesapla: aynı besin tekrar içe aktarılırsa eskiler silinip
      // güncel food_portion.csv verisiyle değiştirilir (idempotent).
      const portionRows = portionsByFdcId.get(row.fdc_id) ?? []
      if (portionRows.length > 0) {
        const portionValues = portionRows
          .map((portionRow, index) => {
            const grams = toNumber(portionRow.gram_weight)
            if (grams === null) return null
            const measureUnitName = measureUnitNameById.get(portionRow.measure_unit_id)
            const label =
              portionRow.portion_description.trim() ||
              [toNumber(portionRow.amount), measureUnitName, portionRow.modifier.trim()]
                .filter(Boolean)
                .join(' ') ||
              `Porsiyon ${index + 1}`
            return {
              foodId: food.id,
              label,
              grams: grams.toString(),
              isDefault: index === 0,
              sortOrder: toNumber(portionRow.seq_num) ?? index,
            }
          })
          .filter((value): value is NonNullable<typeof value> => value !== null)

        await db.delete(foodPortions).where(eq(foodPortions.foodId, food.id))
        if (portionValues.length > 0) {
          await db.insert(foodPortions).values(portionValues)
          portionCount += portionValues.length
        }
      }

      if (foodCount % 500 === 0) {
        console.log(`... ${foodCount}/${foodRows.length} besin işlendi`)
      }
    }

    await resolvePreferredSources(db)

    console.log('\n--- USDA FDC İçe Aktarma Özeti ---')
    console.log(`Besin: ${foodCount}`)
    console.log(`Besin öğesi değeri: ${nutrientValueCount}`)
    console.log(`Tahmini (imputed) değer: ${imputedCount}`)
    console.log(`Porsiyon: ${portionCount}`)
    console.log(`Yinelenen (dedupe edilen) besin öğesi satırı: ${duplicateNutrientRowCount}`)
    console.log(`Eşlenmemiş USDA besin öğesi id: ${unmapped.size}`)
    if (unmapped.size > 0) {
      console.log('UNMAPPED:', Array.from(unmapped).join(', '))
    }

    const proteinId = nutrientIdByCode.get('PROCNT')
    const carbId = nutrientIdByCode.get('CHOCDF')
    const fatId = nutrientIdByCode.get('FAT')
    const energyId = nutrientIdByCode.get('ENERC_KCAL')

    if (!proteinId || !carbId || !fatId || !energyId || usdaNutrientMap.length === 0) {
      console.log(
        '\nAtwater doğrulaması atlandı: besin öğesi eşleme dosyası henüz boş. ' +
          'usda-nutrient-map.ts doldurulduktan sonra tekrar çalıştır.',
      )
    } else {
      const macroNutrientIds = [proteinId, carbId, fatId, energyId]
      const sample = importedFoodIds
        .sort(() => Math.random() - 0.5)
        .slice(0, Math.min(5, importedFoodIds.length))

      console.log(`\n--- Atwater Doğrulaması (${sample.length} besin) ---`)
      for (const foodId of sample) {
        const [food] = await db.select().from(foods).where(eq(foods.id, foodId))
        const values = await db
          .select()
          .from(foodNutrients)
          .where(
            and(
              eq(foodNutrients.foodId, foodId),
              inArray(foodNutrients.nutrientId, macroNutrientIds),
              eq(foodNutrients.isPreferred, true),
            ),
          )
        const byNutrientId = new Map(values.map((value) => [value.nutrientId, Number(value.valuePer100g)]))
        const protein = byNutrientId.get(proteinId)
        const carb = byNutrientId.get(carbId)
        const fat = byNutrientId.get(fatId)
        const statedKcal = byNutrientId.get(energyId)

        if (protein === undefined || carb === undefined || fat === undefined || statedKcal === undefined) {
          console.log(`${food?.nameTr}: eksik makro veri, atlandı.`)
          continue
        }

        const calculatedKcal = calculateAtwaterEnergyKcal(protein, carb, fat)
        const deviation = statedKcal === 0 ? 0 : Math.abs(calculatedKcal - statedKcal) / statedKcal
        const flag = deviation > 0.1 ? '⚠ SAPMA >%10' : 'OK'
        console.log(
          `${food?.nameTr}: beyan ${statedKcal.toFixed(1)} kcal, hesaplanan ${calculatedKcal.toFixed(1)} kcal — ${flag}`,
        )
      }
    }
  } finally {
    await db.$client.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

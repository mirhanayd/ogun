import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { and, eq, inArray } from 'drizzle-orm'
import type * as XLSXType from 'xlsx'
import { dataSources, foodNutrients, foods, nutrients } from '@ogun/db/schema'
import { resolvePreferredSources } from '../lib/merge'
import { normalizeSearchText } from '../lib/normalize'
import { upsertFoodNutrients, type FoodNutrientUpsertInput } from '../lib/upsert'
import { blsNutrientMap } from './bls-nutrient-map'

// xlsx'in ESM derlemesi (xlsx.mjs) Node fs'e bağlı readFile/writeFile'ı içermez
// (tarayıcı uyumlu olsun diye çıkarılmış). CJS derlemeyi doğrudan require ile alıyoruz.
const require = createRequire(import.meta.url)
const XLSX = require('xlsx') as typeof XLSXType

// BLS Excel'indeki üç "meta" sütunun TAM başlığı (packages/etl/data/bls/bls-4.0.xlsx
// üzerinde `pnpm etl:bls:headers` ile doğrulandı).
const BLS_COLUMNS = {
  sourceCode: 'BLS Code',
  nameEn: 'Food name',
}

const BLS_CITATION =
  'Max Rubner-Institut (2025): Bundeslebensmittelschlüssel (BLS), ' +
  'Version 4.0 – Deutsche Nährstoffdatenbank. Karlsruhe. ' +
  'DOI: 10.25826/Data20251217-134202-0'

// BLS'teki "Datenherkunft" sütununun kapalı kelime dağarcığı (dosyadan örneklenerek
// doğrulandı). Sadece 'Analyse' (doğrudan laboratuvar analizi) ve 'Logische Null'
// (tanım gereği kesin sıfır, ör. çiğ yulafta alkol) tahmini SAYILMIYOR — geri kalan
// tüm kategoriler (literatür, formülle hesaplama, başka veri tabanından alınma,
// etiket beyanı, yeniden ölçekleme, tarif hesabı, iz miktar, mantıksal varsayım,
// örnek hesaplama) tahmini kabul ediliyor.
const DIRECT_ORIGIN_VALUES = new Set(['Analyse', 'Logische Null'])

function resolveDefaultFilePath() {
  return path.resolve(process.cwd(), 'data/bls/bls-4.0.xlsx')
}

function parseArgs(argv: string[]) {
  const listHeaders = argv.includes('--list-headers')
  const fileArg = argv.find((arg) => arg.startsWith('--file='))
  const filePath = fileArg ? fileArg.slice('--file='.length) : resolveDefaultFilePath()
  return { listHeaders, filePath }
}

function readSheetRows(filePath: string): Record<string, unknown>[] {
  const workbook = XLSX.readFile(filePath)
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    throw new Error('Excel dosyasında hiç sayfa bulunamadı.')
  }
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) {
    throw new Error(`Sayfa okunamadı: ${sheetName}`)
  }
  return XLSX.utils.sheet_to_json(sheet, { defval: null })
}

function classifyIsImputed(originValue: unknown): boolean {
  if (typeof originValue !== 'string' || originValue.trim() === '' || originValue === '-') {
    // Kaynak bilgisi yoksa güvenli tarafta kal: tahmini say.
    return true
  }
  return !DIRECT_ORIGIN_VALUES.has(originValue.trim())
}

// Basit Atwater enerji hesabı — tam sürümü packages/nutrition-core'da (Hafta 2,
// Prompt 2.1) kurulacak. Burada sadece içe aktarılan verinin makul olduğunu
// hızlıca doğrulamak için kullanılıyor.
function calculateAtwaterEnergyKcal(protein: number, carb: number, fat: number): number {
  return protein * 4 + carb * 4 + fat * 9
}

async function main() {
  const { listHeaders, filePath } = parseArgs(process.argv.slice(2))

  if (!existsSync(filePath)) {
    console.error(`BLS Excel dosyası bulunamadı: ${filePath}`)
    console.error('Beklenen konum: packages/etl/data/bls/bls-4.0.xlsx (blsdb.de/download adresinden indir)')
    process.exit(1)
  }

  if (listHeaders) {
    const rows = readSheetRows(filePath)
    const headers = rows[0] ? Object.keys(rows[0]) : []
    console.log(`${headers.length} sütun bulundu:\n`)
    headers.forEach((header, index) => console.log(`${index + 1}. ${header}`))
    return
  }

  // DATABASE_URL gerektiren bağlantı, sadece burada (--list-headers modundan
  // sonra) kurulur, böylece başlıkları listelemek için veritabanı gerekmez.
  const { db } = await import('@ogun/db')

  try {
    const rows = readSheetRows(filePath)
    if (rows.length === 0) {
      console.warn('Excel dosyasında veri satırı bulunamadı.')
      return
    }
    const headers = Object.keys(rows[0]!)

    if (!headers.includes(BLS_COLUMNS.sourceCode) || !headers.includes(BLS_COLUMNS.nameEn)) {
      throw new Error(
        `Beklenen meta sütunlar bulunamadı (${BLS_COLUMNS.sourceCode}, ${BLS_COLUMNS.nameEn}). ` +
          `\`pnpm etl:bls:headers\` ile gerçek başlıkları listele ve src/importers/bls.ts içindeki ` +
          `BLS_COLUMNS sabitini güncelle.\nMevcut başlıklar: ${headers.join(', ')}`,
      )
    }

    // GÖREV 4: BLS'i data_sources'a kaynak ve atıf bilgisiyle kaydet.
    const [blsSource] = await db
      .insert(dataSources)
      .values({
        code: 'BLS4',
        name: 'Bundeslebensmittelschlüssel',
        version: '4.0',
        license: 'CC BY 4.0',
        citation: BLS_CITATION,
        priority: 80,
      })
      .onConflictDoUpdate({
        target: dataSources.code,
        set: {
          name: 'Bundeslebensmittelschlüssel',
          version: '4.0',
          license: 'CC BY 4.0',
          citation: BLS_CITATION,
          priority: 80,
        },
      })
      .returning()
    if (!blsSource) {
      throw new Error('data_sources kaydı oluşturulamadı.')
    }

    const nutrientRows = await db.select().from(nutrients)
    const nutrientIdByCode = new Map(nutrientRows.map((nutrient) => [nutrient.code, nutrient.id]))

    const mappedValueColumns = new Set(blsNutrientMap.map((mapping) => mapping.valueColumn))
    const mappedOriginColumns = new Set(
      blsNutrientMap.filter((mapping) => mapping.originColumn).map((mapping) => mapping.originColumn),
    )
    const metaColumns = new Set([BLS_COLUMNS.sourceCode, BLS_COLUMNS.nameEn])
    const unmapped = new Set(
      headers.filter(
        (header) =>
          !metaColumns.has(header) && !mappedValueColumns.has(header) && !mappedOriginColumns.has(header),
      ),
    )

    let foodCount = 0
    let nutrientValueCount = 0
    let imputedCount = 0
    const importedFoodIds: string[] = []

    for (const row of rows) {
      const sourceCode = row[BLS_COLUMNS.sourceCode]
      if (sourceCode === null || sourceCode === undefined || sourceCode === '') {
        continue
      }
      const nameEnRaw = row[BLS_COLUMNS.nameEn]
      const nameEn = typeof nameEnRaw === 'string' && nameEnRaw.trim() !== '' ? nameEnRaw.trim() : null
      const nameTr = nameEn ?? String(sourceCode)

      const [food] = await db
        .insert(foods)
        .values({
          sourceId: blsSource.id,
          sourceCode: String(sourceCode),
          nameTr,
          nameEn,
          searchText: normalizeSearchText(nameTr),
          needsTranslation: true,
          isVerified: false,
        })
        .onConflictDoUpdate({
          target: [foods.sourceId, foods.sourceCode],
          set: {
            nameTr,
            nameEn,
            searchText: normalizeSearchText(nameTr),
            needsTranslation: true,
          },
        })
        .returning()
      if (!food) continue

      foodCount += 1
      importedFoodIds.push(food.id)

      // Bu besinin tüm besin öğesi değerlerini biriktirip TEK seferde yazıyoruz
      // (satır başına 56 ayrı round-trip yerine 1 — büyük içe aktarmalarda
      // (7.000+ besin) bu fark dakikalar ile saatler arasında).
      const nutrientBatch: FoodNutrientUpsertInput[] = []
      for (const mapping of blsNutrientMap) {
        const rawValue = row[mapping.valueColumn]
        if (rawValue === null || rawValue === undefined || rawValue === '') continue

        const numericValue = typeof rawValue === 'number' ? rawValue : Number.parseFloat(String(rawValue))
        if (Number.isNaN(numericValue)) continue

        const nutrientId = nutrientIdByCode.get(mapping.nutrientCode)
        if (!nutrientId) {
          console.warn(`nutrients tablosunda bulunamayan kod: ${mapping.nutrientCode}`)
          continue
        }

        const isImputed = classifyIsImputed(
          mapping.originColumn ? row[mapping.originColumn] : undefined,
        )
        if (isImputed) imputedCount += 1

        nutrientBatch.push({
          foodId: food.id,
          nutrientId,
          valuePer100g: numericValue.toString(),
          sourceId: blsSource.id,
          isImputed,
        })
      }

      await upsertFoodNutrients(db, nutrientBatch)
      nutrientValueCount += nutrientBatch.length

      if (foodCount % 500 === 0) {
        console.log(`... ${foodCount}/${rows.length} besin işlendi`)
      }
    }

    // Bu içe aktarmadan sonra hangi kaynağın (foodId, nutrientId) başına aktif
    // sayılacağını yeniden hesapla (bkz. src/lib/merge.ts).
    await resolvePreferredSources(db)

    console.log('\n--- BLS 4.0 İçe Aktarma Özeti ---')
    console.log(`Besin: ${foodCount}`)
    console.log(`Besin öğesi değeri: ${nutrientValueCount}`)
    console.log(`Tahmini (imputed) değer: ${imputedCount}`)
    console.log(`Eşlenmemiş sütun: ${unmapped.size}`)
    if (unmapped.size > 0) {
      console.log('UNMAPPED:', Array.from(unmapped).join(', '))
    }

    // GÖREV 3: rastgele 5 besinde Atwater doğrulaması — beyan edilen enerji,
    // protein/karbonhidrat/yağdan hesaplanan enerjiden %10'dan fazla sapıyor mu?
    const proteinId = nutrientIdByCode.get('PROCNT')
    const carbId = nutrientIdByCode.get('CHOCDF')
    const fatId = nutrientIdByCode.get('FAT')
    const energyId = nutrientIdByCode.get('ENERC_KCAL')

    if (!proteinId || !carbId || !fatId || !energyId || blsNutrientMap.length === 0) {
      console.log(
        '\nAtwater doğrulaması atlandı: besin öğesi eşleme dosyası henüz boş. ' +
          'bls-nutrient-map.ts doldurulduktan sonra tekrar çalıştır.',
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

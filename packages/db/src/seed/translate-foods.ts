import { mkdir, writeFile } from 'node:fs/promises'
import postgres from 'postgres'
import { normalizeSearchText } from '../lib/normalize'

try {
  process.loadEnvFile(new URL('../../../../.env', import.meta.url))
} catch {
  // Üretimde DATABASE_URL ortam tarafından enjekte edilebilir.
}

const BATCH_SIZE = Number(process.env.TRANSLATION_BATCH_SIZE ?? 250)
const CONCURRENCY = Number(process.env.TRANSLATION_CONCURRENCY ?? 8)
const REVIEW_FILE = new URL('../../../../docs/data/flagged-food-translations.json', import.meta.url)
const MAX_ATTEMPTS = 6
const SAME_NAME_ALLOWED = new Set(['salsa verde'])

if (!Number.isInteger(BATCH_SIZE) || BATCH_SIZE < 200 || BATCH_SIZE > 500) {
  throw new Error('TRANSLATION_BATCH_SIZE 200-500 arasında bir tam sayı olmalı.')
}

if (!Number.isInteger(CONCURRENCY) || CONCURRENCY < 1 || CONCURRENCY > 16) {
  throw new Error('TRANSLATION_CONCURRENCY 1-16 arasında bir tam sayı olmalı.')
}

type FoodRow = {
  id: string
  source: 'BLS4' | 'USDA_FDN' | 'USDA_SR'
  nameEn: string
}

type Translation = FoodRow & {
  nameTr: string
  searchText: string
}

type ReviewItem = FoodRow & {
  reason: string
  attemptedTranslation?: string
}

// Google Translate'in bazı diyetetik terimleri bağlama göre fazla genel veya
// yanlış çevirebildiği yerlerde anlamı sabit tutar. Uzun ifadeler önce gelir.
const ENGLISH_TERMS: Array<[string, string]> = [
  ['separable lean only', 'yalnızca ayrılabilir yağsız kısmı'],
  ['ultimate deep dish crust', 'ekstra kalın tava tabanı'],
  ['large deep dish crust', 'büyük kalın tava tabanı'],
  ['without added salt', 'tuz eklenmemiş'],
  ['without salt', 'tuzsuz'],
  ['with added salt', 'tuz eklenmiş'],
  ['USDA choice', 'USDA Choice kalite sınıfı'],
  ['USDA select', 'USDA Select kalite sınıfı'],
  ['USDA prime', 'USDA Prime kalite sınıfı'],
  ['cheese gratinated', 'peynirle gratenlenmiş'],
  ['pepperoni pizza', 'pepperonili pizza'],
  ['deep dish crust', 'kalın tava tabanı'],
  ['pan crust', 'tava hamuru'],
  ['whole grain', 'tam tahıllı'],
  ['whole-grain', 'tam tahıllı'],
  ['wholemeal', 'tam buğdaylı'],
  ['deep-fried', 'derin yağda kızartılmış'],
  ['dry heat', 'kuru ısı yöntemiyle'],
  ['moist heat', 'nemli ısı yöntemiyle'],
  ['lean only', 'yalnızca yağsız kısmı'],
  ['fricassee', 'frikase'],
  ['gratinated', 'gratenlenmiş'],
  ['rutabaga', 'İsveç şalgamı'],
  ['toddlers', 'küçük çocuklar için'],
  ['toddler', 'küçük çocuklar için'],
  ['dices', 'küp doğranmış'],
  ['skinless', 'derisiz'],
  ['bone-in', 'kemikli'],
  ['boneless', 'kemiksiz'],
  ['braised', 'güveçte pişirilmiş'],
  ['stewed', 'güveçte pişirilmiş'],
  ['steamed', 'buharda pişirilmiş'],
  ['broiled', 'ızgarada pişirilmiş'],
  ['grilled', 'ızgarada pişirilmiş'],
  ['roasted', 'fırınlanmış'],
  ['baked', 'fırınlanmış'],
  ['boiled', 'haşlanmış'],
  ['fried', 'kızartılmış'],
  ['drained', 'süzülmüş'],
  ['peeled', 'soyulmuş'],
  ['cooked', 'pişmiş'],
  ['raw', 'çiğ'],
  ['fillet', 'fileto'],
  ['breast', 'göğüs'],
  ['hake', 'barlam balığı'],
  ['choice', 'Choice kalite sınıfı'],
  ['select', 'Select kalite sınıfı'],
  ['prime', 'Prime kalite sınıfı'],
]

const GERMAN_TERMS: Array<[string, string]> = [
  ['Vollkorn', 'tam tahıllı'],
  ['gedämpft', 'buharda pişirilmiş'],
  ['gedünstet', 'kısık ateşte pişirilmiş'],
  ['gebraten', 'tavada pişirilmiş'],
  ['gebacken', 'fırınlanmış'],
  ['gekocht', 'haşlanmış'],
  ['gegart', 'pişmiş'],
  ['Filet', 'fileto'],
  ['Brust', 'göğüs'],
  ['roh', 'çiğ'],
]

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function protectTerms(input: string) {
  // BLS4 name_en çoğunlukla İngilizcedir, ancak bazı satırlarda Almanca ad
  // bulunabilir. Kaynak koduna güvenmek yerine iki sözlüğü de uygularız.
  const terms = [...ENGLISH_TERMS, ...GERMAN_TERMS]
  const replacements = new Map<string, string>()
  let protectedText = input

  for (const [term, translation] of terms) {
    const marker = `OGUNTERM${replacements.size}X`
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(term)}(?![\\p{L}\\p{N}])`, 'giu')
    if (pattern.test(protectedText)) {
      protectedText = protectedText.replace(pattern, marker)
      replacements.set(marker, translation)
    }
  }

  return { protectedText, replacements }
}

function restoreTerms(input: string, replacements: Map<string, string>): string {
  let restored = input
  for (const [marker, translation] of replacements) {
    restored = restored.replaceAll(marker, translation)
  }
  return restored
    .replace(/\s+([,;:)])/g, '$1')
    .replace(/([(])\s+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function validateTranslation(food: FoodRow, nameTr: string): string | null {
  if (!nameTr) return 'Çeviri servisi boş sonuç döndürdü.'
  if (nameTr.includes('OGUNTERM')) return 'Korunan terminoloji işaretçisi çözülemedi.'
  if (nameTr.length < 2) return 'Çeviri olağandışı kısa.'

  const source = normalizeSearchText(food.nameEn)
  const target = normalizeSearchText(nameTr)
  if (
    source === target &&
    food.nameEn.trim().split(/\s+/).length > 1 &&
    !SAME_NAME_ALLOWED.has(food.nameEn.trim().toLocaleLowerCase('en-US'))
  ) {
    return 'Çeviri kaynak metinle aynı kaldı.'
  }

  return null
}

async function translateFood(food: FoodRow): Promise<Translation> {
  const { protectedText, replacements } = protectTerms(food.nameEn)
  const url = new URL('https://translate.googleapis.com/translate_a/single')
  url.search = new URLSearchParams({
    client: 'gtx',
    sl: 'auto',
    tl: 'tr',
    dt: 't',
    q: protectedText,
  }).toString()

  let lastError: unknown
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const payload = (await response.json()) as unknown
      if (!Array.isArray(payload) || !Array.isArray(payload[0])) {
        throw new Error('Beklenmeyen çeviri servisi yanıtı.')
      }

      const translated = payload[0]
        .map((segment) =>
          Array.isArray(segment) && typeof segment[0] === 'string' ? segment[0] : '',
        )
        .join('')
      const nameTr = restoreTerms(translated, replacements)
      const validationError = validateTranslation(food, nameTr)
      if (validationError) throw new Error(validationError)

      return { ...food, nameTr, searchText: normalizeSearchText(nameTr) }
    } catch (error) {
      lastError = error
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)))
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

async function translateBatch(
  rows: FoodRow[],
): Promise<{ translated: Translation[]; flagged: ReviewItem[] }> {
  const translated: Translation[] = []
  const flagged: ReviewItem[] = []
  let cursor = 0

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, rows.length) }, async () => {
      while (cursor < rows.length) {
        const food = rows[cursor++]!
        try {
          translated.push(await translateFood(food))
        } catch (error) {
          flagged.push({
            ...food,
            reason: error instanceof Error ? error.message : String(error),
          })
        }
      }
    }),
  )

  return { translated, flagged }
}

async function writeReviewFile(items: ReviewItem[]) {
  await mkdir(new URL('.', REVIEW_FILE), { recursive: true })
  await writeFile(
    REVIEW_FILE,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), count: items.length, items }, null, 2)}\n`,
    'utf8',
  )
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL is not set')

  const directUrl = new URL(databaseUrl)
  directUrl.hostname = directUrl.hostname.replace('-pooler', '')
  const sql = postgres(directUrl.toString(), { max: 1, ssl: 'require' })
  const startedAt = Date.now()
  const allFlagged: ReviewItem[] = []
  let translatedThisRun = 0

  try {
    const total = (await sql<{ total: number }[]>`select count(*)::int as total from foods`)[0]!
      .total
    const initiallyCompleted = (
      await sql<{ completed: number }[]>`
      select count(*)::int as completed from foods where needs_translation = false
    `
    )[0]!.completed

    console.log(
      `Çeviri başlıyor: ${initiallyCompleted}/${total} tamamlandı, batch=${BATCH_SIZE}, eşzamanlılık=${CONCURRENCY}.`,
    )

    while (true) {
      const rows = await sql<FoodRow[]>`
        select f.id, ds.code::text as source, f.name_en as "nameEn"
        from foods f
        join data_sources ds on ds.id = f.source_id
        where f.needs_translation = true and f.name_en is not null
        order by ds.code, f.id
        limit ${BATCH_SIZE}
      `
      if (rows.length === 0) break

      const { translated, flagged } = await translateBatch(rows)
      allFlagged.push(...flagged)
      await writeReviewFile(allFlagged)

      // Şüpheli bir satırı yanlışlıkla tamamlandı saymamak için batch'i burada
      // durdururuz. Başarılı önceki batch'ler Neon'da kalıcıdır ve yeniden
      // çalıştırmada otomatik olarak atlanır.
      if (flagged.length > 0) {
        throw new Error(
          `${flagged.length} satır incelemeye ayrıldı; bu batch veritabanına yazılmadı.`,
        )
      }

      const updates = translated.map(({ id, nameTr, searchText }) => ({
        id,
        name_tr: nameTr,
        search_text: searchText,
      }))
      await sql.begin(async (tx) => {
        await tx`
          update foods as f
          set name_tr = v.name_tr,
              search_text = v.search_text,
              needs_translation = false,
              updated_at = now()
          from jsonb_to_recordset(${tx.json(updates)})
            as v(id text, name_tr text, search_text text)
          where f.id = v.id and f.needs_translation = true
        `
      })

      translatedThisRun += translated.length
      const completed = (
        await sql<{ completed: number }[]>`
        select count(*)::int as completed from foods where needs_translation = false
      `
      )[0]!.completed
      console.log(
        `${completed}/${total} tamamlandı (+${translated.length}, bu çalıştırmada ${translatedThisRun}).`,
      )
    }

    await writeReviewFile(allFlagged)
    const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000)
    console.log(
      `Çeviri tamamlandı: ${translatedThisRun} satır, ${allFlagged.length} inceleme kaydı, ${elapsedSeconds} saniye.`,
    )
  } finally {
    await sql.end({ timeout: 5 })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

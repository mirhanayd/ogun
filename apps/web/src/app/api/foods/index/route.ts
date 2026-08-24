import { gzipSync } from 'node:zlib'
import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@ogun/db'
import {
  getAllFoodSearchIndexEntries,
  getFoodIndexVersion,
  getNutrientDefinitions,
} from '@ogun/db/queries'
import { withRequestLogging } from '@/lib/monitoring/logger'

// İstemci tarafı (Dexie + Orama) offline arama indeksinin kaynağı. Tüm katalogu
// tek seferde, sıkıştırılmış olarak döner — hedef: 10.000 besin için < 1.5 MB.
// ?v= sürümü mevcut sürümle eşleşiyorsa (veya If-None-Match tutuyorsa) 304 döner,
// böylece istemci sürüm değişmediği sürece hiç veri indirmez.
async function handleGet(request: NextRequest): Promise<Response> {
  const version = await getFoodIndexVersion(db)
  const etag = `"${version}"`

  const requestedVersion = request.nextUrl.searchParams.get('v')
  const ifNoneMatch = request.headers.get('if-none-match')
  const notModified = ifNoneMatch === etag

  if (notModified) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        ETag: etag,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  }

  // NOT: entries şekli GitHub issue #24 / Prompt 5.2 kapsamında groupNameTr
  // aldı (bkz. getAllFoodIndexEntries) — istemci (food-index.ts) bunu
  // gzip'lenmiş gövdeden aynen taşıyor, burada ayrıca dönüştürme YOK.
  // GitHub issue #26 / Prompt 5.4 — entries artık TAM besin öğesi haritası
  // (nutrientsPer100g) taşıyor, ve cevaba nutrientDefs (besin öğesi adı/
  // birim/isCore metadata'sı) eklendi — aynı versiyonlu önbellek, iki ayrı
  // fetch yerine tek indirme.
  const [entries, nutrientDefs] = await Promise.all([
    getAllFoodSearchIndexEntries(db),
    getNutrientDefinitions(db),
  ])
  const body = gzipSync(Buffer.from(JSON.stringify({ version, entries, nutrientDefs })))

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Encoding': 'gzip',
      ETag: etag,
      'Cache-Control':
        requestedVersion === null
          ? 'no-cache'
          : 'public, max-age=31536000, s-maxage=31536000, immutable',
    },
  })
}

export const GET = withRequestLogging('foods.index', handleGet)

import { gzipSync } from 'node:zlib'
import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@ogun/db'
import { getAllFoodIndexEntries, getFoodIndexVersion } from '@ogun/db/queries'

// İstemci tarafı (Dexie + Orama) offline arama indeksinin kaynağı. Tüm katalogu
// tek seferde, sıkıştırılmış olarak döner — hedef: 10.000 besin için < 1.5 MB.
// ?v= sürümü mevcut sürümle eşleşiyorsa (veya If-None-Match tutuyorsa) 304 döner,
// böylece istemci sürüm değişmediği sürece hiç veri indirmez.
export async function GET(request: NextRequest) {
  const version = await getFoodIndexVersion(db)
  const etag = `"${version}"`

  const requestedVersion = request.nextUrl.searchParams.get('v')
  const ifNoneMatch = request.headers.get('if-none-match')
  const notModified = requestedVersion === version || ifNoneMatch === etag

  if (notModified) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        ETag: etag,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  }

  const entries = await getAllFoodIndexEntries(db)
  // NOT: entries şekli GitHub issue #24 / Prompt 5.2 kapsamında groupNameTr
  // aldı (bkz. getAllFoodIndexEntries) — istemci (food-index.ts) bunu
  // gzip'lenmiş gövdeden aynen taşıyor, burada ayrıca dönüştürme YOK.
  const body = gzipSync(Buffer.from(JSON.stringify({ version, entries })))

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Encoding': 'gzip',
      ETag: etag,
      'Cache-Control':
        requestedVersion === null
          ? 'no-cache'
          : 'public, max-age=31536000, immutable',
    },
  })
}

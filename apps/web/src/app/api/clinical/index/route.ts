import { gzipSync } from 'node:zlib'
import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@ogun/db'
import { getClinicalCatalogSnapshot, getClinicalCatalogVersion } from '@ogun/db/queries'
import { withRequestLogging } from '@/lib/monitoring/logger'

async function handleGet(request: NextRequest): Promise<Response> {
  const version = await getClinicalCatalogVersion(db)
  const etag = `"${version}"`
  if (request.headers.get('if-none-match') === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: { ETag: etag, 'Cache-Control': 'public, max-age=31536000, immutable' },
    })
  }
  const snapshot = await getClinicalCatalogSnapshot(db)
  const body = gzipSync(Buffer.from(JSON.stringify({ version, ...snapshot })))
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Encoding': 'gzip',
      ETag: etag,
      'Cache-Control': request.nextUrl.searchParams.has('v')
        ? 'public, max-age=31536000, s-maxage=31536000, immutable'
        : 'no-cache',
    },
  })
}

export const GET = withRequestLogging('clinical.index', handleGet)

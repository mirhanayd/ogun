import { gzipSync } from 'node:zlib'
import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@ogun/db'
import { getAllFoodNutrientPackEntries, getFoodIndexVersion } from '@ogun/db/queries'
import { withRequestLogging } from '@/lib/monitoring/logger'

async function handleGet(request: NextRequest): Promise<Response> {
  const version = await getFoodIndexVersion(db)
  const requestedVersion = request.nextUrl.searchParams.get('v')
  if (requestedVersion === version && request.headers.get('if-none-match') === `"${version}"`) {
    return new NextResponse(null, { status: 304 })
  }

  const entries = await getAllFoodNutrientPackEntries(db)
  const body = gzipSync(Buffer.from(JSON.stringify({ version, entries })))
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Encoding': 'gzip',
      ETag: `"${version}"`,
      'Cache-Control': requestedVersion
        ? 'public, max-age=31536000, s-maxage=31536000, immutable'
        : 'no-cache',
    },
  })
}

export const GET = withRequestLogging('foods.nutrients', handleGet)

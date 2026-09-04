import { NextResponse } from 'next/server'
import { db } from '@ogun/db'
import { getClinicalCatalogVersion } from '@ogun/db/queries'
import { withRequestLogging } from '@/lib/monitoring/logger'

async function handleGet(): Promise<Response> {
  return NextResponse.json(
    { version: await getClinicalCatalogVersion(db) },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export const GET = withRequestLogging('clinical.index.version', handleGet)

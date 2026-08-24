import { NextResponse } from 'next/server'
import { db } from '@ogun/db'
import { getFoodIndexVersion } from '@ogun/db/queries'
import { withRequestLogging } from '@/lib/monitoring/logger'

async function handleGet(): Promise<Response> {
  return NextResponse.json(
    { version: await getFoodIndexVersion(db) },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export const GET = withRequestLogging('foods.index.version', handleGet)

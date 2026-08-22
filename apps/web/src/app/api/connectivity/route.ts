import { NextResponse } from 'next/server'
import { db } from '@ogun/db'
import { checkDatabaseConnectivity } from '@ogun/db/queries'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await checkDatabaseConnectivity(db)
    return NextResponse.json(
      { online: true },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    )
  } catch {
    return NextResponse.json(
      { online: false },
      { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } },
    )
  }
}

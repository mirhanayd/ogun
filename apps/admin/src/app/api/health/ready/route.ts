import { db } from '@ogun/db'
import { checkDatabaseConnection } from '@ogun/db/queries'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await checkDatabaseConnection(db)
    return Response.json({ status: 'ready' })
  } catch {
    return Response.json({ status: 'not_ready' }, { status: 503 })
  }
}

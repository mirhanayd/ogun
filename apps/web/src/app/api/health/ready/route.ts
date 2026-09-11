import { db } from '@ogun/db'
import { checkDatabaseConnection } from '@ogun/db/queries'
import { readinessResponse } from '@/lib/operations/health'

export const dynamic = 'force-dynamic'

export function GET() {
  return readinessResponse(() => checkDatabaseConnection(db))
}

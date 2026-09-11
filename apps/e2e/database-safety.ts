import { assertLocalDatabaseTarget } from '@ogun/db/database-target'

export function requireLocalE2eDatabase() {
  return assertLocalDatabaseTarget(process.env.DATABASE_URL, 'E2E and integration writes')
}

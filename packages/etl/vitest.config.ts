import { defineConfig } from 'vitest/config'
import { assertLocalDatabaseTarget } from '@ogun/db/database-target'

if (process.env.DATABASE_URL) {
  assertLocalDatabaseTarget(process.env.DATABASE_URL, '@ogun/etl tests')
}

export default defineConfig({ test: { testTimeout: 30_000 } })

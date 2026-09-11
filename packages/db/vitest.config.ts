import { defineConfig } from 'vitest/config'
import { assertLocalDatabaseTarget } from './src/database-target'

if (process.env.DATABASE_URL) {
  assertLocalDatabaseTarget(process.env.DATABASE_URL, '@ogun/db tests')
}

export default defineConfig({ test: { testTimeout: 30_000 } })

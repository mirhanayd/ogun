import path from 'node:path'
import { defineConfig } from 'vitest/config'
import { assertLocalDatabaseTarget } from '@ogun/db/database-target'

if (process.env.DATABASE_URL) assertLocalDatabaseTarget(process.env.DATABASE_URL, 'admin tests')

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'server-only': path.resolve(__dirname, './src/test/server-only.ts'),
    },
  },
  test: {
    environment: 'node',
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/ogun_test',
    },
  },
})

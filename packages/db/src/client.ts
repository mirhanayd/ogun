import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema/index'

declare global {
  // eslint-disable-next-line no-var
  var __ogunDbClient: ReturnType<typeof postgres> | undefined
}

function createConnection() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set')
  }
  return postgres(databaseUrl)
}

const client = globalThis.__ogunDbClient ?? createConnection()

if (process.env.NODE_ENV !== 'production') {
  globalThis.__ogunDbClient = client
}

export const db = drizzle(client, { schema })
export type Database = typeof db

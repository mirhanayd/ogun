import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertDatabaseWriteTarget,
  describeDatabaseTarget,
  describeDatabaseWritePolicy,
  parseDatabaseTarget,
} from '../database-target'

type SchemaOperation = 'migrate' | 'push'
const packageDirectory = fileURLToPath(new URL('../..', import.meta.url))

export function runSchemaWrite(operation: SchemaOperation, checkOnly = false): never | void {
  const target = parseDatabaseTarget(process.env.DATABASE_URL)
  for (const line of describeDatabaseTarget(target)) console.log(line)
  for (const line of describeDatabaseWritePolicy(target)) console.log(line)
  console.log(`Operation: ${operation}${checkOnly ? ' (preflight only)' : ''}`)

  assertDatabaseWriteTarget({ operation, databaseUrl: process.env.DATABASE_URL })
  if (checkOnly) {
    console.log('Database write preflight passed; no database connection was opened.')
    return
  }

  const drizzleCli = resolve(packageDirectory, 'node_modules', 'drizzle-kit', 'bin.cjs')
  const result = spawnSync(
    process.execPath,
    [drizzleCli, operation, '--config', 'drizzle.config.ts'],
    {
      cwd: packageDirectory,
      env: process.env,
      stdio: 'inherit',
    },
  )
  if (result.error) throw result.error
  process.exit(result.status ?? 1)
}

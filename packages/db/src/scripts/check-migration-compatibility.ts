import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postgres from 'postgres'
import { describeDatabaseTarget, parseDatabaseTarget } from '../database-target'

const databaseUrl = process.env.DATABASE_URL
const target = parseDatabaseTarget(databaseUrl)
for (const line of describeDatabaseTarget(target)) console.log(line)
if (!databaseUrl) throw new Error('DATABASE_URL is not explicitly set')
const sql = postgres(databaseUrl, { ssl: 'prefer', max: 1 })

const journal = JSON.parse(readFileSync(resolve('drizzle/meta/_journal.json'), 'utf8')) as {
  entries: Array<{ tag: string; when: number }>
}
const latest = journal.entries.at(-1)
if (!latest) throw new Error('Repository migration journal is empty.')

try {
  const rows = await sql<{ created_at: string }[]>`
    select created_at::text as created_at
    from drizzle.__drizzle_migrations
    order by created_at desc
    limit 1
  `
  const appliedWhen = rows[0] ? Number(rows[0].created_at) : null
  const applied = journal.entries.find((entry) => entry.when === appliedWhen)
  console.log(`Repository latest: ${latest.tag}`)
  console.log(`Target latest: ${applied?.tag ?? 'UNKNOWN'}`)
  const compatible = appliedWhen !== null && appliedWhen >= latest.when
  console.log(`Migration compatibility: ${compatible ? 'PASS' : 'BLOCKED'}`)
  if (!compatible) process.exitCode = 1
} finally {
  await sql.end()
}

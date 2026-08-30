import { sql } from 'drizzle-orm'
import { expect, test } from 'vitest'

test('RxNorm mappings have no orphan medication substance references', async () => {
  const { db } = await import('@ogun/db')
  const rows = await db.execute(sql`
    select count(*)::int as orphan_count
    from medication_substance_mappings mapping
    left join medication_substances substance on substance.id = mapping.medication_substance_id
    where substance.id is null
  `)
  expect(Number((rows as Array<Record<string, unknown>>)[0]?.orphan_count)).toBe(0)
})

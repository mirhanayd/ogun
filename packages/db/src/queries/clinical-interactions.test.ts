import { drizzle } from 'drizzle-orm/postgres-js'
import { describe, expect, it } from 'vitest'
import type { Database } from '../client'
import * as schema from '../schema/index'
import { buildPublishedMedicationInteractionsQuery } from './clinical'

describe('published clinical interaction query safety', () => {
  it('compiles mandatory published and approved predicates', () => {
    const mockDb = drizzle.mock({ schema })
    const compiled = buildPublishedMedicationInteractionsQuery(
      mockDb as unknown as Database,
      ['medication-substance-1'],
    ).toSQL()

    expect(compiled.sql).toContain('"clinical_interactions"."status" = $2')
    expect(compiled.sql).toContain('"clinical_interactions"."review_status" = $3')
    expect(compiled.params).toEqual(['medication-substance-1', 'published', 'approved'])
    expect(compiled.sql).not.toContain('evidence_summary')
  })
})

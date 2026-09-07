import { drizzle } from 'drizzle-orm/postgres-js'
import { describe, expect, it } from 'vitest'
import type { Database } from '../client'
import * as schema from '../schema/index'
import { buildListClinicalReviewTasksQuery } from './clinical-review'

describe('clinical review query builder safety', () => {
  it('compiles listClinicalReviewTasks with correct filters and constraints', () => {
    const mockDb = drizzle.mock({ schema })
    const { itemsQuery, countQuery, limit, offset } = buildListClinicalReviewTasksQuery(
      mockDb as unknown as Database,
      {
        priority: 'P1',
        status: 'pending',
        requiredCapability: 'medication_food',
        searchQuery: 'linezolid',
        limit: 10,
        offset: 0,
      },
    )

    expect(limit).toBe(10)
    expect(offset).toBe(0)

    const compiledItems = itemsQuery.toSQL()
    expect(compiledItems.sql).toContain('"clinical_review_tasks"."review_priority" = $1')
    expect(compiledItems.sql).toContain('"clinical_review_tasks"."status" = $2')
    expect(compiledItems.sql).toContain('"clinical_review_tasks"."required_capability" = $3')
    expect(compiledItems.params).toContain('P1')
    expect(compiledItems.params).toContain('pending')
    expect(compiledItems.params).toContain('medication_food')

    const compiledCount = countQuery.toSQL()
    expect(compiledCount.sql).toContain('count(*)::int')
  })
})

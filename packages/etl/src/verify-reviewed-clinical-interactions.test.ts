import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { assertReviewedClinicalMigrationSql } from './verify-reviewed-clinical-interactions'

describe('reviewed clinical migration guard', () => {
  it('accepts the generated additive migration', () => {
    const migration = readFileSync(
      path.resolve('../db/drizzle/0028_brown_major_mapleleaf.sql'),
      'utf8',
    )
    expect(() => assertReviewedClinicalMigrationSql(migration)).not.toThrow()
  })

  it.each(['DROP TABLE x', 'TRUNCATE x', 'DELETE FROM x'])('rejects destructive SQL: %s', (sql) => {
    expect(() => assertReviewedClinicalMigrationSql(sql)).toThrow(/destructive SQL/)
  })
})

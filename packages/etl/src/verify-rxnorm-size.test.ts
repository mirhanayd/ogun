import { describe, expect, test } from 'vitest'
import {
  DATABASE_HARD_LIMIT_BYTES,
  DATABASE_WARNING_BYTES,
  evaluateClinicalDatabaseFootprint,
} from './verify-rxnorm-size'

describe('clinical DB size policy', () => {
  test('size below warning threshold passes', () => {
    expect(
      evaluateClinicalDatabaseFootprint({
        database_bytes: DATABASE_WARNING_BYTES - 1,
        mapping_table_bytes: 10,
        mapping_index_bytes: 5,
      }),
    ).toMatchObject({ warning: false, withinHardLimit: true })
  })

  test('size at warning threshold warns without failing', () => {
    expect(
      evaluateClinicalDatabaseFootprint({
        database_bytes: DATABASE_WARNING_BYTES,
        mapping_table_bytes: 0,
        mapping_index_bytes: 0,
      }),
    ).toMatchObject({ warning: true, withinHardLimit: true })
  })

  test('size over one GiB hard-fails', () => {
    expect(
      evaluateClinicalDatabaseFootprint({
        database_bytes: DATABASE_HARD_LIMIT_BYTES + 1,
        mapping_table_bytes: 0,
        mapping_index_bytes: 0,
      }).withinHardLimit,
    ).toBe(false)
  })
})

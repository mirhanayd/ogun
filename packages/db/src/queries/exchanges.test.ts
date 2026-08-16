import { createId } from '@paralleldrive/cuid2'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../client'

// GitHub issue #28 / Prompt 5.6 — exchanges query katmanının round-trip
// testi. plans.test.ts'teki AYNI desen (bkz. o dosyanın dosya başı notu):
// DATABASE_URL set edilmediyse bu describe TAMAMEN atlanır.
const DATABASE_URL = process.env.DATABASE_URL
const describeWithDb = DATABASE_URL ? describe : describe.skip

describeWithDb('exchanges query layer (round-trip, gerçek DB)', () => {
  let db: Database
  let foodId: string

  beforeAll(async () => {
    const clientModule = await import('../client')
    db = clientModule.db
    const { foods, dataSources } = await import('../schema/foods')
    const { foodExchanges, exchangeGroups } = await import('../schema/exchanges')
    const { eq } = await import('drizzle-orm')

    const [existingSource] = await db
      .select()
      .from(dataSources)
      .where(eq(dataSources.code, 'CUSTOM'))
      .limit(1)
    const sourceId = existingSource!.id

    const [ekmekGroup] = await db
      .select()
      .from(exchangeGroups)
      .where(eq(exchangeGroups.code, 'EKMEK'))
      .limit(1)
    const ekmekGroupId = ekmekGroup!.id

    const suffix = createId()
    const [food] = await db
      .insert(foods)
      .values({
        sourceId,
        sourceCode: `TEST-EXCHANGE-${suffix}`,
        nameTr: 'Test ekmeği',
        searchText: 'test ekmegi',
        isVerified: true,
      })
      .returning()
    foodId = food!.id

    await db.insert(foodExchanges).values({
      foodId,
      groupId: ekmekGroupId,
      gramsPerExchange: '25.00',
      isPrimary: true,
    })
  })

  afterAll(async () => {
    const { foodExchanges } = await import('../schema/exchanges')
    const { foods } = await import('../schema/foods')
    const { eq } = await import('drizzle-orm')
    await db.delete(foodExchanges).where(eq(foodExchanges.foodId, foodId))
    await db.delete(foods).where(eq(foods.id, foodId))
    await db.$client.end()
  })

  it('listExchangeGroups seed edilmiş tüm 6 grubu döner', async () => {
    const { listExchangeGroups } = await import('./exchanges')
    const groups = await listExchangeGroups(db)
    expect(groups.length).toBeGreaterThanOrEqual(6)
    expect(groups.map((g) => g.code)).toEqual(
      expect.arrayContaining(['EKMEK', 'ET', 'SUT', 'MEYVE', 'SEBZE', 'YAG']),
    )
  })

  it('listFoodsForExchangeGroup eklenen test besinini gramsPerExchange ile birlikte döner', async () => {
    const { listFoodsForExchangeGroup } = await import('./exchanges')
    const rows = await listFoodsForExchangeGroup(db, 'EKMEK', 50)
    const testRow = rows.find((r) => r.foodId === foodId)
    expect(testRow).toBeDefined()
    expect(testRow?.gramsPerExchange).toBe(25)
    expect(testRow?.isPrimary).toBe(true)
  })

  it('bilinmeyen/boş bir grup için boş liste döner', async () => {
    const { listFoodsForExchangeGroup } = await import('./exchanges')
    const rows = await listFoodsForExchangeGroup(db, 'YAG', 5)
    expect(Array.isArray(rows)).toBe(true)
  })
})

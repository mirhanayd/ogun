import { describe, expect, it } from 'vitest'
import {
  computeExchangeUsage,
  computeUnconvertedItemCount,
  convertExchangeCountToGrams,
  convertItemToExchange,
  type FoodExchangeInfo,
} from './plan-exchanges'

const EKMEK_INFO: FoodExchangeInfo = { groupCode: 'EKMEK', groupNameTr: 'Ekmek', gramsPerExchange: 25 }
const ET_INFO: FoodExchangeInfo = { groupCode: 'ET', groupNameTr: 'Et', gramsPerExchange: 30 }

describe('convertItemToExchange', () => {
  it('bir besinin gram miktarını grubunun değişim adedine çevirir', () => {
    const lookup = new Map([['ekmek-1', EKMEK_INFO]])
    const result = convertItemToExchange({ foodId: 'ekmek-1', amountGrams: 50 }, lookup)
    expect(result).toEqual({ groupCode: 'EKMEK', groupNameTr: 'Ekmek', exchangeCount: 2 })
  })

  it('foodId null ise null döner (serbest metin/tarif kalemi)', () => {
    const lookup = new Map<string, FoodExchangeInfo | null>()
    expect(convertItemToExchange({ foodId: null, amountGrams: 50 }, lookup)).toBeNull()
  })

  it('besinin değişim eşleşmesi yoksa null döner', () => {
    const lookup = new Map<string, FoodExchangeInfo | null>([['x', null]])
    expect(convertItemToExchange({ foodId: 'x', amountGrams: 50 }, lookup)).toBeNull()
  })
})

describe('convertExchangeCountToGrams', () => {
  it('değişim adedini grama çevirir (convertItemToExchange ile TERS işlem)', () => {
    expect(convertExchangeCountToGrams(2, EKMEK_INFO)).toBe(50)
  })
})

describe('computeExchangeUsage', () => {
  it('kalemleri gruplarına göre toplar', () => {
    const lookup = new Map<string, FoodExchangeInfo | null>([
      ['ekmek-1', EKMEK_INFO],
      ['et-1', ET_INFO],
    ])
    const usage = computeExchangeUsage(
      [
        { foodId: 'ekmek-1', amountGrams: 50 },
        { foodId: 'ekmek-1', amountGrams: 25 },
        { foodId: 'et-1', amountGrams: 60 },
        { foodId: null, amountGrams: 100 }, // serbest metin — atlanır
      ],
      lookup,
    )
    expect(usage.EKMEK).toBeCloseTo(3)
    expect(usage.ET).toBeCloseTo(2)
    expect(usage.SUT).toBeUndefined()
  })
})

describe('computeUnconvertedItemCount', () => {
  it('değişime dahil edilemeyen kalemleri sayar', () => {
    const lookup = new Map<string, FoodExchangeInfo | null>([['ekmek-1', EKMEK_INFO]])
    const count = computeUnconvertedItemCount(
      [
        { foodId: 'ekmek-1', amountGrams: 50 },
        { foodId: null, amountGrams: 100 },
        { foodId: 'bilinmeyen', amountGrams: 20 },
      ],
      lookup,
    )
    expect(count).toBe(2)
  })
})

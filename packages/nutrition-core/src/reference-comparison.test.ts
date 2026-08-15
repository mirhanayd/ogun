import { describe, expect, it } from 'vitest'
import { compareToReference, type AgeGroupReference } from './reference-comparison'

const reference: AgeGroupReference = {
  ageGroupCode: 'TEST',
  ageGroupLabel: 'Test grubu',
  sex: 'all',
  ranges: [
    { nutrientCode: 'ENERC_KCAL', min: 1800, max: 2200, unit: 'kcal' },
    { nutrientCode: 'PROCNT', min: 50, max: null, unit: 'g' },
    { nutrientCode: 'NA', min: null, max: 2300, unit: 'mg' },
    { nutrientCode: 'VITD', min: null, max: null, unit: 'µg' },
  ],
}

describe('compareToReference', () => {
  it('aralık içindeyse within döner', () => {
    const [result] = compareToReference({ ENERC_KCAL: 2000 }, reference)
    expect(result?.status).toBe('within')
  })

  it('alt sınırın altındaysa below döner', () => {
    const [result] = compareToReference({ ENERC_KCAL: 1500 }, reference)
    expect(result?.status).toBe('below')
  })

  it('üst sınırın üstündeyse above döner', () => {
    const [result] = compareToReference({ ENERC_KCAL: 2500 }, reference)
    expect(result?.status).toBe('above')
  })

  it('sadece alt sınırı olan besin öğesinde üst sınırsız kontrol yapar', () => {
    const result = compareToReference({ PROCNT: 100 }, reference).find((r) => r.nutrientCode === 'PROCNT')
    expect(result?.status).toBe('within')
  })

  it('sadece üst sınırı olan besin öğesinde alt sınırsız kontrol yapar', () => {
    const result = compareToReference({ NA: 500 }, reference).find((r) => r.nutrientCode === 'NA')
    expect(result?.status).toBe('within')
  })

  it('hiç sınırı olmayan besin öğesi için no_reference döner', () => {
    const result = compareToReference({ VITD: 10 }, reference).find((r) => r.nutrientCode === 'VITD')
    expect(result?.status).toBe('no_reference')
  })

  it('değer eksikse 0 kabul eder', () => {
    const result = compareToReference({}, reference).find((r) => r.nutrientCode === 'ENERC_KCAL')
    expect(result?.actualValue).toBe(0)
    expect(result?.status).toBe('below')
  })
})

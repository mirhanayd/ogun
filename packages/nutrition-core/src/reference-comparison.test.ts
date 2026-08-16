import { describe, expect, it } from 'vitest'
import {
  classifyNutrientLevel,
  compareToReference,
  selectAgeGroupReference,
  type AgeGroupReference,
} from './reference-comparison'

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

describe('selectAgeGroupReference', () => {
  const groups: AgeGroupReference[] = [
    { ageGroupCode: 'ADULT_MALE', ageGroupLabel: 'Yetişkin erkek', sex: 'male', minAge: 19, maxAge: 30, ranges: [] },
    {
      ageGroupCode: 'ADULT_FEMALE',
      ageGroupLabel: 'Yetişkin kadın',
      sex: 'female',
      minAge: 19,
      maxAge: 30,
      ranges: [],
    },
    { ageGroupCode: 'CHILD', ageGroupLabel: 'Çocuk', sex: 'all', minAge: 4, maxAge: 6, ranges: [] },
  ]

  it('tam yaş/cinsiyet eşleşmesi varsa onu döner', () => {
    expect(selectAgeGroupReference(groups, 25, 'male')?.ageGroupCode).toBe('ADULT_MALE')
    expect(selectAgeGroupReference(groups, 5, 'female')?.ageGroupCode).toBe('CHILD')
  })

  it('tam eşleşme yoksa aynı cinsiyetteki en yakın yetişkin gruba düşer', () => {
    expect(selectAgeGroupReference(groups, 45, 'female')?.ageGroupCode).toBe('ADULT_FEMALE')
  })

  it('cinsiyet hiç eşleşmiyorsa null döner', () => {
    const onlyMale: AgeGroupReference[] = [groups[0] as AgeGroupReference]
    expect(selectAgeGroupReference(onlyMale, 25, 'female')).toBeNull()
  })
})

describe('classifyNutrientLevel', () => {
  const ref: AgeGroupReference = {
    ageGroupCode: 'TEST',
    ageGroupLabel: 'Test',
    sex: 'all',
    ranges: [
      { nutrientCode: 'FE', min: 18, max: 45, unit: 'mg' },
      { nutrientCode: 'NA', min: null, max: 2300, unit: 'mg' },
      { nutrientCode: 'VITD', min: null, max: null, unit: 'µg' },
    ],
  }

  it('%67 altı kırmızı (low) bandına düşer', () => {
    const [result] = classifyNutrientLevel({ FE: 10 }, ref)
    expect(result?.band).toBe('low')
    expect(result?.percentOfReference).toBeCloseTo((10 / 18) * 100)
  })

  it('%67-90 arası sarı (adequate) bandına düşer', () => {
    const result = classifyNutrientLevel({ FE: 14.4 }, ref).find((r) => r.nutrientCode === 'FE')
    expect(result?.band).toBe('adequate')
  })

  it('%90-110 arası yeşil (optimal) bandına düşer', () => {
    const result = classifyNutrientLevel({ FE: 18 }, ref).find((r) => r.nutrientCode === 'FE')
    expect(result?.band).toBe('optimal')
  })

  it('üst sınırı (UL) aşarsa turuncu (excessive) bandına düşer', () => {
    const result = classifyNutrientLevel({ FE: 50 }, ref).find((r) => r.nutrientCode === 'FE')
    expect(result?.band).toBe('excessive')
  })

  it('sadece üst sınırı olan besin öğesinde de UL kontrolü yapar', () => {
    const withinLimit = classifyNutrientLevel({ NA: 2000 }, ref).find((r) => r.nutrientCode === 'NA')
    expect(withinLimit?.band).toBe('optimal')
    const overLimit = classifyNutrientLevel({ NA: 2500 }, ref).find((r) => r.nutrientCode === 'NA')
    expect(overLimit?.band).toBe('excessive')
  })

  it('hiç referansı olmayan besin öğesi için no_reference döner', () => {
    const result = classifyNutrientLevel({ VITD: 10 }, ref).find((r) => r.nutrientCode === 'VITD')
    expect(result?.band).toBe('no_reference')
    expect(result?.percentOfReference).toBeNull()
  })
})

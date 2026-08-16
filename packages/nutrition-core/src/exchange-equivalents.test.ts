import { describe, expect, it } from 'vitest'
import { buildGroupEquivalentsRow, buildGroupEquivalentsTable } from './exchange-equivalents'

const EKMEK = { code: 'EKMEK', nameTr: 'Ekmek' }

describe('buildGroupEquivalentsRow', () => {
  it('sadece gram verisi olan besinler için gramText üretir, portionText null kalır', () => {
    const row = buildGroupEquivalentsRow(EKMEK, [
      { foodNameTr: 'ekmek', gramsPerExchange: 25, portionLabel: null, portionGrams: null },
    ])
    expect(row.headerText).toBe('1 ekmek değişimi =')
    expect(row.equivalents).toEqual([
      { foodNameTr: 'ekmek', gramText: '25 g ekmek', portionText: null },
    ])
  })

  it('ev ölçüsü verisi olan besinler için portionText de üretir', () => {
    const row = buildGroupEquivalentsRow(EKMEK, [
      {
        foodNameTr: 'pilav',
        gramsPerExchange: 50,
        portionLabel: 'yemek kaşığı',
        portionGrams: 25,
      },
    ])
    expect(row.equivalents[0]).toEqual({
      foodNameTr: 'pilav',
      gramText: '50 g pilav',
      portionText: '2 yemek kaşığı pilav',
    })
  })

  it('ondalıklı porsiyon sayısını tek basamağa yuvarlar', () => {
    const row = buildGroupEquivalentsRow(EKMEK, [
      { foodNameTr: 'makarna', gramsPerExchange: 30, portionLabel: 'kase', portionGrams: 20 },
    ])
    expect(row.equivalents[0]?.portionText).toBe('1.5 kase makarna')
  })

  it('boş besin listesi için boş equivalents döner', () => {
    const row = buildGroupEquivalentsRow(EKMEK, [])
    expect(row.equivalents).toEqual([])
  })
})

describe('buildGroupEquivalentsTable', () => {
  it('verilen grup sırasını korur ve eksik gruplar için boş equivalents üretir', () => {
    const SEBZE = { code: 'SEBZE', nameTr: 'Sebze' }
    const foodsByGroupCode = new Map([
      [
        'EKMEK',
        [{ foodNameTr: 'ekmek', gramsPerExchange: 25, portionLabel: null, portionGrams: null }],
      ],
    ])
    const table = buildGroupEquivalentsTable([EKMEK, SEBZE], foodsByGroupCode)
    expect(table.map((row) => row.groupCode)).toEqual(['EKMEK', 'SEBZE'])
    expect(table[0]?.equivalents).toHaveLength(1)
    expect(table[1]?.equivalents).toEqual([])
  })
})

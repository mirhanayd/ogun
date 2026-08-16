import { describe, expect, it } from 'vitest'
import type { ClientAllergenEntry } from '@ogun/db/schema'
import { buildAllergenConflictMap, findAllergenConflicts } from './allergen-conflict'

const peanutAllergy: ClientAllergenEntry = {
  id: 'a1',
  label: 'fıstık',
  normalized: 'fistik',
  severity: 'şiddetli',
  note: null,
}
const lactoseIntolerance: ClientAllergenEntry = {
  id: 'i1',
  label: 'laktoz',
  normalized: 'laktoz',
  severity: 'orta',
  note: null,
}

describe('findAllergenConflicts', () => {
  it('besin adı alerjen etiketini içeriyorsa çakışma bulur', () => {
    const conflicts = findAllergenConflicts('Fıstıklı kurabiye', [peanutAllergy], [])
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]?.kind).toBe('allergy')
  })

  it('intolerans listesiyle de çalışır', () => {
    const conflicts = findAllergenConflicts('Laktozlu süt tozu', [], [lactoseIntolerance])
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]?.kind).toBe('intolerance')
  })

  it('eşleşme yoksa boş dizi döner', () => {
    expect(findAllergenConflicts('Tavuk göğsü', [peanutAllergy], [lactoseIntolerance])).toEqual([])
  })

  it('Türkçe karakter/aksan farkına duyarsızdır (normalize üzerinden)', () => {
    // "Fistikli" (aksansız yazım) da normalize sonrası "fistik" ile eşleşir.
    const conflicts = findAllergenConflicts('Fistikli ezme', [peanutAllergy], [])
    expect(conflicts).toHaveLength(1)
  })
})

describe('buildAllergenConflictMap', () => {
  it('sadece çakışan besinleri haritaya ekler', () => {
    const foodNames = new Map([
      ['food-1', 'Fıstık ezmesi'],
      ['food-2', 'Tavuk göğsü'],
    ])
    const map = buildAllergenConflictMap(foodNames, [peanutAllergy], [])
    expect(map.has('food-1')).toBe(true)
    expect(map.has('food-2')).toBe(false)
  })

  it('alerji/intolerans listesi boşsa boş harita döner', () => {
    const foodNames = new Map([['food-1', 'Fıstık ezmesi']])
    expect(buildAllergenConflictMap(foodNames, [], []).size).toBe(0)
    expect(buildAllergenConflictMap(foodNames, null, null).size).toBe(0)
  })
})

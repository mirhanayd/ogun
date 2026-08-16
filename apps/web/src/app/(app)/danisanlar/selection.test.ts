import { describe, expect, it } from 'vitest'
import { selectedClientIds, selectionSummaryLabel } from './selection'

describe('selectedClientIds', () => {
  it('boş bir seçim haritası için boş dizi döner', () => {
    expect(selectedClientIds({})).toEqual([])
  })

  it('sadece true olan girdileri id dizisine çevirir', () => {
    expect(selectedClientIds({ client_1: true, client_2: false, client_3: true })).toEqual([
      'client_1',
      'client_3',
    ])
  })

  it('hiçbir satır seçili değilse (hepsi false) boş dizi döner', () => {
    expect(selectedClientIds({ client_1: false, client_2: false })).toEqual([])
  })
})

describe('selectionSummaryLabel', () => {
  it('0 veya negatif için boş metin döner (araç çubuğu gizlenmeli)', () => {
    expect(selectionSummaryLabel(0)).toBe('')
    expect(selectionSummaryLabel(-1)).toBe('')
  })

  it('1 için tekil ifade döner', () => {
    expect(selectionSummaryLabel(1)).toBe('1 danışan seçildi')
  })

  it('birden fazla için sayıyı içeren ifade döner', () => {
    expect(selectionSummaryLabel(5)).toBe('5 danışan seçildi')
  })
})

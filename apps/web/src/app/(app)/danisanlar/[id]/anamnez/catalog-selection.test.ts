import { describe, expect, it } from 'vitest'
import { appendUniqueBy, removeByKey } from './catalog-selection'

interface Selection {
  id: string
  label: string
}

const key = (selection: Selection) => selection.id

describe('catalog multi-selection', () => {
  it('condition veya medication seçimini ekler', () => {
    expect(appendUniqueBy([], { id: 'condition:1', label: 'Tip 2 diyabet' }, key)).toEqual([
      { id: 'condition:1', label: 'Tip 2 diyabet' },
    ])
  })

  it('aynı canonical kaydın tekrar seçilmesini engeller', () => {
    const selected = [{ id: 'product:1', label: 'GLİFOR' }]
    expect(appendUniqueBy(selected, { id: 'product:1', label: 'GLİFOR' }, key)).toEqual(selected)
  })

  it('seçimi canonical anahtarıyla kaldırır', () => {
    const selected = [
      { id: 'product:1', label: 'GLİFOR' },
      { id: 'substance:1', label: 'Metformin' },
    ]
    expect(removeByKey(selected, 'product:1', key)).toEqual([
      { id: 'substance:1', label: 'Metformin' },
    ])
  })
})

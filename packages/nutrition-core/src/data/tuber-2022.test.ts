import { describe, expect, it } from 'vitest'
import { compareToReference } from '../reference-comparison'
import { TUBER_2022_PLACEHOLDER } from './tuber-2022'

describe('TUBER_2022_PLACEHOLDER', () => {
  it('3 örnek yaş grubu içerir (gerçek TÜBER veri seti gelene kadar)', () => {
    expect(TUBER_2022_PLACEHOLDER).toHaveLength(3)
  })

  it('her grup compareToReference ile kullanılabilir yapıda', () => {
    for (const group of TUBER_2022_PLACEHOLDER) {
      const result = compareToReference({ ENERC_KCAL: 2000, PROCNT: 60 }, group)
      expect(result.length).toBeGreaterThan(0)
    }
  })
})

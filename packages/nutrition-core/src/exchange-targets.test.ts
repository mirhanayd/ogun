import { describe, expect, it } from 'vitest'
import { compareExchangeUsageToTargets, deriveExchangeTargets } from './exchange-targets'

describe('deriveExchangeTargets', () => {
  it('tablo basamağıyla tam eşleşen kalori için o basamağın değerlerini döner', () => {
    const targets = deriveExchangeTargets(2000)
    expect(targets).toEqual({ EKMEK: 10, ET: 6, SUT: 3, MEYVE: 4, SEBZE: 5, YAG: 6 })
  })

  it('iki basamak arasındaki kalori için doğrusal interpolasyon yapar', () => {
    // 1650 kcal, 1500 (EKMEK 7) ve 1800 (EKMEK 9) arasında tam ortada.
    const targets = deriveExchangeTargets(1650)
    expect(targets.EKMEK).toBeCloseTo(8)
  })

  it('tablonun altındaki bir kalori için en düşük basamağa sıkıştırır', () => {
    const targets = deriveExchangeTargets(800)
    expect(targets).toEqual(deriveExchangeTargets(1200))
  })

  it('tablonun üstündeki bir kalori için en yüksek basamağa sıkıştırır', () => {
    const targets = deriveExchangeTargets(5000)
    expect(targets).toEqual(deriveExchangeTargets(2800))
  })
})

describe('compareExchangeUsageToTargets', () => {
  it('her grup için target/used/remaining hesaplar', () => {
    const targets = deriveExchangeTargets(2000)
    const result = compareExchangeUsageToTargets(targets, { EKMEK: 4, ET: 8 })
    const ekmek = result.find((r) => r.code === 'EKMEK')
    const et = result.find((r) => r.code === 'ET')
    const sut = result.find((r) => r.code === 'SUT')
    expect(ekmek).toEqual({ code: 'EKMEK', target: 10, used: 4, remaining: 6 })
    // ET hedefi 6, kullanılan 8 -> remaining negatif (hedef aşıldı).
    expect(et).toEqual({ code: 'ET', target: 6, used: 8, remaining: -2 })
    expect(sut).toEqual({ code: 'SUT', target: 3, used: 0, remaining: 3 })
  })
})

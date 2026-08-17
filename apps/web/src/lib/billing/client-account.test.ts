import { describe, expect, it } from 'vitest'
import { calculateClientBalance } from './client-account'

describe('calculateClientBalance', () => {
  it('toplam paket fiyatından toplam ödemeyi düşerek borç hesaplar', () => {
    const packages = [{ price: '3000' }, { price: '1500' }]
    const payments = [{ amount: '2000' }, { amount: '500' }]
    expect(calculateClientBalance(packages, payments)).toEqual({ totalOwed: 4500, totalPaid: 2500, balance: 2000 })
  })

  it('borç yoksa/fazla ödendiyse balance negatif veya sıfır olabilir', () => {
    const packages = [{ price: '1000' }]
    const payments = [{ amount: '1000' }]
    expect(calculateClientBalance(packages, payments).balance).toBe(0)
  })

  it('paket yoksa ama paket dışı ödeme varsa balance negatif çıkar (fazla ödeme)', () => {
    const packages: { price: string }[] = []
    const payments = [{ amount: '200' }]
    expect(calculateClientBalance(packages, payments).balance).toBe(-200)
  })
})

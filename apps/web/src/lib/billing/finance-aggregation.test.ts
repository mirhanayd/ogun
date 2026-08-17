import { describe, expect, it } from 'vitest'
import {
  monthlyIncomeExpense,
  revenueByDietitian,
  sumPaymentsByClientPackage,
  uncollectedReceivables,
  type ExpenseForAggregation,
  type PaymentForAggregation,
} from './finance-aggregation'

describe('monthlyIncomeExpense', () => {
  it('gelir ve gideri ayrı ayrı toplar, net hesaplar', () => {
    const payments: PaymentForAggregation[] = [
      { amount: '1500.00', paidAt: new Date('2026-08-01'), dietitianId: null, dietitianName: null },
      { amount: '750.50', paidAt: new Date('2026-08-15'), dietitianId: null, dietitianName: null },
    ]
    const expenses: ExpenseForAggregation[] = [{ amount: '400', date: '2026-08-05' }]
    expect(monthlyIncomeExpense(payments, expenses)).toEqual({ income: 2250.5, expense: 400, net: 1850.5 })
  })

  it('boş listelerde sıfır döner', () => {
    expect(monthlyIncomeExpense([], [])).toEqual({ income: 0, expense: 0, net: 0 })
  })
})

describe('revenueByDietitian', () => {
  it('diyetisyen bazında gruplayıp toplar, büyükten küçüğe sıralar', () => {
    const payments: PaymentForAggregation[] = [
      { amount: '1000', paidAt: new Date(), dietitianId: 'd1', dietitianName: 'Dyt. Ayşe' },
      { amount: '500', paidAt: new Date(), dietitianId: 'd2', dietitianName: 'Dyt. Mehmet' },
      { amount: '300', paidAt: new Date(), dietitianId: 'd1', dietitianName: 'Dyt. Ayşe' },
    ]
    expect(revenueByDietitian(payments)).toEqual([
      { dietitianId: 'd1', dietitianName: 'Dyt. Ayşe', total: 1300 },
      { dietitianId: 'd2', dietitianName: 'Dyt. Mehmet', total: 500 },
    ])
  })

  it('atanmamış danışan ödemelerini "Atanmamış" altında toplar, sessizce atmaz', () => {
    const payments: PaymentForAggregation[] = [
      { amount: '200', paidAt: new Date(), dietitianId: null, dietitianName: null },
    ]
    expect(revenueByDietitian(payments)).toEqual([{ dietitianId: 'unassigned', dietitianName: 'Atanmamış', total: 200 }])
  })
})

describe('uncollectedReceivables', () => {
  it('paket fiyatı ile ödenen tutar arasındaki pozitif farkı toplar', () => {
    const packages = [
      { id: 'cp1', price: '3000', status: 'aktif' as const },
      { id: 'cp2', price: '1500', status: 'tamamlandı' as const },
    ]
    const paidMap = new Map([
      ['cp1', 1000],
      ['cp2', 1500],
    ])
    expect(uncollectedReceivables(packages, paidMap)).toBe(2000)
  })

  it('fazla ödenen paketleri negatif alacak olarak SAYMAZ', () => {
    const packages = [{ id: 'cp1', price: '1000', status: 'aktif' as const }]
    const paidMap = new Map([['cp1', 1500]])
    expect(uncollectedReceivables(packages, paidMap)).toBe(0)
  })
})

describe('sumPaymentsByClientPackage', () => {
  it('paket dışı (clientPackageId null) ödemeleri atlar', () => {
    const payments = [
      { clientPackageId: 'cp1', amount: '500' },
      { clientPackageId: null, amount: '100' },
      { clientPackageId: 'cp1', amount: '250' },
    ]
    expect(sumPaymentsByClientPackage(payments)).toEqual(new Map([['cp1', 750]]))
  })
})

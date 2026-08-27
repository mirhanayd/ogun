import { describe, expect, it } from 'vitest'
import { requiresSubscriptionPayment } from './access'

describe('requiresSubscriptionPayment', () => {
  it('plan zorunluluğundan önceki trial hesabın girişini engellemez', () => {
    expect(requiresSubscriptionPayment('trialing', false)).toBe(false)
  })

  it('plan seçmiş yeni trial hesabı ödeme sayfasına gönderir', () => {
    expect(requiresSubscriptionPayment('trialing', true)).toBe(true)
  })

  it('aktif hesabın plan seçimi kaydı olmasa da girişine izin verir', () => {
    expect(requiresSubscriptionPayment('active', false)).toBe(false)
  })

  it.each(['past_due', 'canceled'] as const)('%s hesabı ödeme akışında tutar', (status) => {
    expect(requiresSubscriptionPayment(status, false)).toBe(true)
  })
})

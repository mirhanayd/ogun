import { describe, expect, it } from 'vitest'
import { selectSubscriptionPlanSchema } from './subscription-schemas'

describe('selectSubscriptionPlanSchema', () => {
  it.each([
    ['başlangıç', 'monthly'],
    ['başlangıç', 'yearly'],
    ['klinik', 'monthly'],
    ['klinik', 'yearly'],
  ])('%s / %s seçimini kabul eder', (planCode, billingCycle) => {
    expect(selectSubscriptionPlanSchema.safeParse({ planCode, billingCycle }).success).toBe(true)
  })

  it('kurumsal veya ödeme dönemi olmayan seçimi reddeder', () => {
    expect(selectSubscriptionPlanSchema.safeParse({ planCode: 'kurumsal', billingCycle: 'monthly' }).success).toBe(false)
    expect(selectSubscriptionPlanSchema.safeParse({ planCode: 'klinik' }).success).toBe(false)
  })
})

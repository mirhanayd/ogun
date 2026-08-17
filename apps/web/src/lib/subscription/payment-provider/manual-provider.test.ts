import { describe, expect, it } from 'vitest'
import { createManualPaymentProvider } from './manual-provider'
import { getPaymentProvider } from './index'
import type { PaymentProvider } from './types'

describe('createManualPaymentProvider — PaymentProvider arayüzüne uygunluk', () => {
  it('name alanı "manuel" olmalı', () => {
    const provider: PaymentProvider = createManualPaymentProvider()
    expect(provider.name).toBe('manuel')
  })

  it('startSubscription checkoutUrl null döner — kart bilgisi istenmez', async () => {
    const provider = createManualPaymentProvider()
    const result = await provider.startSubscription({
      clinicId: 'clinic-1',
      clinicName: 'Test Kliniği',
      billingEmail: 'klinik@example.com',
      planCode: 'klinik',
    })
    expect(result.checkoutUrl).toBeNull()
    expect(result.provider).toBe('manuel')
    expect(result.providerCustomerId).toContain('clinic-1')
    expect(result.currentPeriodEnd).not.toBeNull()
    expect(result.currentPeriodEnd!.getTime()).toBeGreaterThan(result.currentPeriodStart.getTime())
  })

  it('cancelSubscription hata fırlatmadan tamamlanır', async () => {
    const provider = createManualPaymentProvider()
    await expect(
      provider.cancelSubscription({ clinicId: 'clinic-1', providerSubscriptionId: 'manuel-clinic-1-klinik' }),
    ).resolves.toBeUndefined()
  })
})

describe('getPaymentProvider', () => {
  it('her çağrıda aynı (cache\'lenmiş) sağlayıcı örneğini döner', () => {
    expect(getPaymentProvider()).toBe(getPaymentProvider())
  })

  it('döndürülen sağlayıcı manuel sağlayıcıdır', () => {
    expect(getPaymentProvider().name).toBe('manuel')
  })
})

import { describe, expect, it } from 'vitest'
import { createManualInvoiceProvider } from './manual-provider'
import { getInvoiceProvider } from './index'
import type { InvoiceProvider } from './types'

describe('createManualInvoiceProvider — InvoiceProvider arayüzüne uygunluk', () => {
  it('name alanı "manuel" olmalı', () => {
    const provider: InvoiceProvider = createManualInvoiceProvider()
    expect(provider.name).toBe('manuel')
  })

  it('girilen seri/sıra no değerlerini olduğu gibi döner, boşları null yapar', async () => {
    const provider = createManualInvoiceProvider()
    const result = await provider.issueReceipt({
      paymentId: 'p1',
      clientName: 'Ayşe Yılmaz',
      amount: '1500',
      paidAt: new Date('2026-08-17T10:00:00Z'),
      series: '  A ',
      sequenceNumber: '000123',
    })
    expect(result).toEqual({
      provider: 'manuel',
      series: 'A',
      sequenceNumber: '000123',
      issuedAt: '2026-08-17',
      externalId: null,
    })
  })

  it('seri/sıra no verilmezse null döner, dış sağlayıcı çağrılmadığı için externalId hep null', async () => {
    const provider = createManualInvoiceProvider()
    const result = await provider.issueReceipt({
      paymentId: 'p2',
      clientName: 'Mehmet Demir',
      amount: '750',
      paidAt: new Date('2026-08-01T00:00:00Z'),
    })
    expect(result.series).toBeNull()
    expect(result.sequenceNumber).toBeNull()
    expect(result.externalId).toBeNull()
  })
})

describe('getInvoiceProvider', () => {
  it('her çağrıda aynı (cache\'lenmiş) sağlayıcı örneğini döner', () => {
    expect(getInvoiceProvider()).toBe(getInvoiceProvider())
  })

  it('döndürülen sağlayıcı manuel sağlayıcıdır', () => {
    expect(getInvoiceProvider().name).toBe('manuel')
  })
})

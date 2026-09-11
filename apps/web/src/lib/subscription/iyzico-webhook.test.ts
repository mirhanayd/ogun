import { createHmac, randomUUID } from 'node:crypto'
import { db } from '@ogun/db'
import { providerWebhookReceipts } from '@ogun/db/schema'
import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it } from 'vitest'
import { POST } from '@/app/api/iyzico/webhook/route'
import { verifyIyzicoSubscriptionWebhook, type IyzicoSubscriptionWebhook } from './iyzico-client'

const payload: IyzicoSubscriptionWebhook = {
  merchantId: 'merchant', iyziEventType: 'subscription.order.success',
  subscriptionReferenceCode: 'subscription', orderReferenceCode: 'order',
  customerReferenceCode: 'customer', iyziReferenceCode: 'event', iyziEventTime: 1_789_030_800_000,
}

afterEach(() => { delete process.env.IYZICO_SECRET_KEY })

describe('iyzico webhook signature', () => {
  it('accepts the provider HMAC and rejects missing or modified signatures', () => {
    process.env.IYZICO_SECRET_KEY = 'test-secret'
    const message = String(payload.merchantId) + 'test-secret' + payload.iyziEventType + payload.subscriptionReferenceCode + payload.orderReferenceCode + payload.customerReferenceCode
    const signature = createHmac('sha256', 'test-secret').update(message, 'utf8').digest('hex')
    expect(verifyIyzicoSubscriptionWebhook(payload, signature)).toBe(true)
    expect(verifyIyzicoSubscriptionWebhook(payload, null)).toBe(false)
    const modifiedSignature = `${signature.slice(0, -1)}${signature.endsWith('0') ? '1' : '0'}`
    expect(verifyIyzicoSubscriptionWebhook(payload, modifiedSignature)).toBe(false)
  })

  const itWithDb = process.env.OPERATIONAL_WRITE_TESTS === '1' ? it : it.skip

  itWithDb('rejects an invalid signature without creating a receipt', async () => {
    process.env.IYZICO_SECRET_KEY = 'test-secret'
    const providerEventId = `invalid-${randomUUID()}`
    const requestPayload = { ...payload, iyziReferenceCode: providerEventId }
    const request = new NextRequest('http://localhost/api/iyzico/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-iyz-signature-v3': 'invalid' },
      body: JSON.stringify(requestPayload),
    })

    expect((await POST(request)).status).toBe(401)
    const receipts = await db.select().from(providerWebhookReceipts)
    expect(receipts.some((receipt) => receipt.providerEventId === providerEventId)).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { buildSubscriptionOperationEmail } from './subscription-operation'

describe('subscription operation email', () => {
  it('uses only allow-listed business fields and excludes provider secrets', () => {
    const email = buildSubscriptionOperationEmail({
      recipientEmail: 'owner@example.com',
      clinicName: 'Örnek Klinik',
      eventType: 'plan_changed',
      payload: {
        fromPlan: 'başlangıç',
        toPlan: 'klinik',
        checkoutToken: 'secret-token',
        providerSubscriptionId: 'provider-secret',
      },
    })
    expect(email.text).toContain('Önceki plan: başlangıç')
    expect(email.text).toContain('Yeni plan: klinik')
    expect(JSON.stringify(email)).not.toContain('secret-token')
    expect(JSON.stringify(email)).not.toContain('provider-secret')
  })
})

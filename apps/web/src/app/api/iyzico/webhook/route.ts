import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@ogun/db'
import {
  getSubscriptionByProviderReference,
  insertSubscriptionEvent,
  updateClinicSubscriptionStatus,
} from '@ogun/db/queries'
import {
  verifyIyzicoSubscriptionWebhook,
  type IyzicoSubscriptionWebhook,
} from '@/lib/subscription/iyzico-client'

export const runtime = 'nodejs'

const webhookSchema = z.object({
  merchantId: z.union([z.string(), z.number()]),
  iyziEventType: z.enum(['subscription.order.success', 'subscription.order.failure']),
  subscriptionReferenceCode: z.string().min(1),
  orderReferenceCode: z.string().min(1),
  customerReferenceCode: z.string().min(1),
  iyziReferenceCode: z.string().min(1),
  iyziEventTime: z.number(),
})

export async function POST(request: NextRequest) {
  const parsed = webhookSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 })

  const signature = request.headers.get('x-iyz-signature-v3')
  if (!verifyIyzicoSubscriptionWebhook(parsed.data as IyzicoSubscriptionWebhook, signature)) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 })
  }

  const subscription = await getSubscriptionByProviderReference(db, parsed.data.subscriptionReferenceCode)
  if (!subscription) return NextResponse.json({ error: 'subscription_not_found' }, { status: 404 })

  const successful = parsed.data.iyziEventType === 'subscription.order.success'
  await updateClinicSubscriptionStatus(db, subscription.clinicId, successful ? 'active' : 'past_due')
  await insertSubscriptionEvent(db, subscription.clinicId, {
    subscriptionId: subscription.id,
    eventType: parsed.data.iyziEventType,
    occurredAt: new Date(parsed.data.iyziEventTime),
    payload: {
      orderReferenceCode: parsed.data.orderReferenceCode,
      customerReferenceCode: parsed.data.customerReferenceCode,
      iyziReferenceCode: parsed.data.iyziReferenceCode,
    },
  })
  return NextResponse.json({ received: true })
}

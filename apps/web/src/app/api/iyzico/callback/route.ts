import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@ogun/db'
import {
  getSubscriptionByCheckoutToken,
  insertSubscriptionEvent,
  updateClinicSubscriptionStatus,
  upsertSubscriptionForClinic,
} from '@ogun/db/queries'
import { retrieveIyzicoSubscription } from '@/lib/subscription/iyzico-client'

export const runtime = 'nodejs'

async function handle(request: NextRequest, token: string | null) {
  const failure = new URL('/odeme?durum=basarisiz', request.nextUrl.origin)
  if (!token) return NextResponse.redirect(failure, 303)

  try {
    const subscription = await getSubscriptionByCheckoutToken(db, token)
    if (!subscription) return NextResponse.redirect(failure, 303)

    const verified = await retrieveIyzicoSubscription(token)
    if (verified.subscriptionStatus !== 'ACTIVE') {
      await insertSubscriptionEvent(db, subscription.clinicId, {
        subscriptionId: subscription.id,
        eventType: 'checkout_not_active',
        payload: { subscriptionStatus: verified.subscriptionStatus },
      })
      return NextResponse.redirect(failure, 303)
    }

    await upsertSubscriptionForClinic(db, subscription.clinicId, {
      planCode: subscription.planCode,
      billingCycle: subscription.billingCycle,
      provider: 'iyzico',
      providerCustomerId: verified.customerReferenceCode,
      providerSubscriptionId: verified.referenceCode,
      checkoutToken: null,
      currentPeriodStart: verified.startDate,
      currentPeriodEnd: verified.endDate,
      cancelAtPeriodEnd: false,
    })
    await updateClinicSubscriptionStatus(db, subscription.clinicId, 'active')
    await insertSubscriptionEvent(db, subscription.clinicId, {
      subscriptionId: subscription.id,
      eventType: 'subscription_activated',
      payload: { provider: 'iyzico' },
    })
    return NextResponse.redirect(new URL('/panel', request.nextUrl.origin), 303)
  } catch {
    return NextResponse.redirect(failure, 303)
  }
}

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const rawToken = formData.get('token')
  return handle(request, typeof rawToken === 'string' ? rawToken : null)
}

export async function GET(request: NextRequest) {
  return handle(request, request.nextUrl.searchParams.get('token'))
}

import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@ogun/db'
import {
  getClinicById,
  getSubscriptionSelectionForUser,
  insertSubscriptionEvent,
  upsertSubscriptionForClinic,
} from '@ogun/db/queries'
import { requireRole } from '@/lib/authz'
import {
  getIyzicoPricingPlanReference,
  initializeIyzicoSubscription,
} from '@/lib/subscription/iyzico-client'
import { iyzicoCustomerSchema } from '@/lib/validation/iyzico-schemas'

export const runtime = 'nodejs'

function page(content: string, status = 200) {
  return new NextResponse(content, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, private',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self' https://*.iyzipay.com; script-src 'self' 'unsafe-inline' https://*.iyzipay.com; style-src 'self' 'unsafe-inline' https://*.iyzipay.com; img-src 'self' data: https://*.iyzipay.com; connect-src 'self' https://*.iyzipay.com; frame-src https://*.iyzipay.com; form-action 'self' https://*.iyzipay.com",
    },
  })
}

function errorPage(message: string, status = 400) {
  const safe = message.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
  return page(`<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Ödeme başlatılamadı</title><body style="font-family:system-ui;max-width:560px;margin:10vh auto;padding:24px"><h1>Ödeme başlatılamadı</h1><p>${safe}</p><p><a href="/odeme">Ödeme sayfasına dön</a></p></body></html>`, status)
}

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get('origin')
    if (origin && origin !== request.nextUrl.origin) return errorPage('Geçersiz istek kaynağı.', 403)

    const context = await requireRole('owner')
    const formData = await request.formData()
    const parsed = iyzicoCustomerSchema.safeParse(Object.fromEntries(formData.entries()))
    if (!parsed.success) return errorPage(parsed.error.issues[0]?.message ?? 'Fatura bilgileri geçersiz.')

    const [clinic, selection] = await Promise.all([
      getClinicById(db, context.scope.clinicId),
      getSubscriptionSelectionForUser(db, context.user.id),
    ])
    if (!clinic || !selection) return errorPage('Klinik veya plan seçimi bulunamadı.')

    const pricingPlanReferenceCode = getIyzicoPricingPlanReference(selection.planCode, selection.billingCycle)
    const callbackUrl = new URL('/api/iyzico/callback', request.nextUrl.origin).toString()
    const checkout = await initializeIyzicoSubscription({
      pricingPlanReferenceCode,
      conversationId: context.scope.clinicId,
      callbackUrl,
      customer: { ...parsed.data, email: context.user.email, country: 'Türkiye' },
    })

    const subscription = await upsertSubscriptionForClinic(db, context.scope.clinicId, {
      planCode: selection.planCode,
      billingCycle: selection.billingCycle,
      provider: 'iyzico',
      providerCustomerId: null,
      providerSubscriptionId: null,
      checkoutToken: checkout.token,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    })
    await insertSubscriptionEvent(db, context.scope.clinicId, {
      subscriptionId: subscription.id,
      eventType: 'checkout_initialized',
      payload: { planCode: selection.planCode, billingCycle: selection.billingCycle },
    })

    return page(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>iyzico Güvenli Ödeme</title><style>body{margin:0;background:#f6f8f7;font-family:system-ui}.wrap{max-width:760px;margin:32px auto;padding:16px}.brand{text-align:center;margin-bottom:18px;color:#185c47;font-weight:700}</style></head><body><main class="wrap"><div class="brand">Öğün · Güvenli ödeme</div><div id="iyzipay-checkout-form" class="responsive"></div>${checkout.checkoutFormContent}</main></body></html>`)
  } catch (error) {
    return errorPage(error instanceof Error ? error.message : 'Ödeme başlatılamadı.', 500)
  }
}

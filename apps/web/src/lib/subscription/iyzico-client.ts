import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { SubscriptionBillingCycle, SubscriptionPlan } from '@ogun/db/schema'
import { iyzicoSandboxRequest } from './iyzico-api'

export interface IyzicoCustomer {
  name: string
  surname: string
  email: string
  gsmNumber: string
  identityNumber: string
  address: string
  city: string
  country: string
  zipCode: string
}

export interface IyzicoCheckoutResult {
  token: string
  checkoutFormContent: string
}

export interface IyzicoSubscriptionResult {
  referenceCode: string
  customerReferenceCode: string | null
  subscriptionStatus: string
  startDate: Date | null
  endDate: Date | null
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} ortam değişkeni tanımlı değil.`)
  return value
}

function pricingPlanEnvName(planCode: SubscriptionPlan, cycle: SubscriptionBillingCycle): string {
  const packageName =
    planCode === 'başlangıç' ? 'SINGLE' : planCode === 'klinik' ? 'TEAM' : 'ENTERPRISE'
  return `IYZICO_${packageName}_${cycle === 'monthly' ? 'MONTHLY' : 'YEARLY'}_PLAN_REFERENCE_CODE`
}

export function getIyzicoPricingPlanReference(
  planCode: SubscriptionPlan,
  cycle: SubscriptionBillingCycle,
): string {
  return requiredEnv(pricingPlanEnvName(planCode, cycle))
}

export async function initializeIyzicoSubscription(input: {
  pricingPlanReferenceCode: string
  conversationId: string
  callbackUrl: string
  customer: IyzicoCustomer
}): Promise<IyzicoCheckoutResult> {
  const address = {
    address: input.customer.address,
    zipCode: input.customer.zipCode,
    contactName: `${input.customer.name} ${input.customer.surname}`,
    city: input.customer.city,
    country: input.customer.country,
  }
  const response = await iyzicoSandboxRequest<Record<string, unknown>>(
    '/v2/subscription/checkoutform/initialize',
    {
      method: 'POST',
      body: {
        locale: 'tr',
        callbackUrl: input.callbackUrl,
        pricingPlanReferenceCode: input.pricingPlanReferenceCode,
        subscriptionInitialStatus: 'ACTIVE',
        conversationId: input.conversationId,
        customer: {
          name: input.customer.name,
          surname: input.customer.surname,
          email: input.customer.email,
          gsmNumber: input.customer.gsmNumber,
          identityNumber: input.customer.identityNumber,
          billingAddress: address,
          shippingAddress: address,
        },
      },
    },
  )
  if (!response.token || !response.checkoutFormContent) {
    throw new Error('iyzico ödeme formu yanıtı eksik geldi.')
  }
  return { token: response.token, checkoutFormContent: response.checkoutFormContent }
}

function fromEpoch(value: unknown): Date | null {
  return typeof value === 'number' && Number.isFinite(value) ? new Date(value) : null
}

export async function retrieveIyzicoSubscription(token: string): Promise<IyzicoSubscriptionResult> {
  const response = await iyzicoSandboxRequest<{
    referenceCode?: string
    customerReferenceCode?: string
    subscriptionStatus?: string
    startDate?: number
    endDate?: number
  }>(`/v2/subscription/checkoutform/${encodeURIComponent(token)}`, { method: 'GET' })
  const data = response.data
  if (!data?.referenceCode || !data.subscriptionStatus) {
    throw new Error('iyzico abonelik doğrulama yanıtı eksik geldi.')
  }
  return {
    referenceCode: data.referenceCode,
    customerReferenceCode: data.customerReferenceCode ?? null,
    subscriptionStatus: data.subscriptionStatus,
    startDate: fromEpoch(data.startDate),
    endDate: fromEpoch(data.endDate),
  }
}

export async function cancelIyzicoSubscription(subscriptionReferenceCode: string): Promise<void> {
  await iyzicoSandboxRequest(
    `/v2/subscription/subscriptions/${encodeURIComponent(subscriptionReferenceCode)}/cancel`,
    {
      method: 'POST',
      body: {},
    },
  )
}

export interface IyzicoSubscriptionWebhook {
  merchantId: string | number
  iyziEventType: 'subscription.order.success' | 'subscription.order.failure'
  subscriptionReferenceCode: string
  orderReferenceCode: string
  customerReferenceCode: string
  iyziReferenceCode: string
  iyziEventTime: number
}

export function verifyIyzicoSubscriptionWebhook(
  payload: IyzicoSubscriptionWebhook,
  receivedSignature: string | null,
): boolean {
  if (!receivedSignature) return false
  const secretKey = requiredEnv('IYZICO_SECRET_KEY')
  const message =
    String(payload.merchantId) +
    secretKey +
    payload.iyziEventType +
    payload.subscriptionReferenceCode +
    payload.orderReferenceCode +
    payload.customerReferenceCode
  const expected = createHmac('sha256', secretKey).update(message, 'utf8').digest('hex')
  const received = receivedSignature.trim().toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(received)) return false
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received, 'hex'))
}

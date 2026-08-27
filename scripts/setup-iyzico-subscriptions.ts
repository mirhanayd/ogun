import { createRequire } from 'node:module'
import { loadEnvFile } from 'node:process'
import {
  IYZICO_SANDBOX_BASE_URL,
  getIyzicoSandboxCredentials,
} from '../apps/web/src/lib/subscription/iyzico-api'

try {
  loadEnvFile(new URL('../.env', import.meta.url))
} catch {
  // CI/Vercel gibi ortamlarda değerler zaten process.env üzerinden gelebilir.
}

const require = createRequire(new URL('../apps/web/package.json', import.meta.url))
const Iyzipay = require('iyzipay')
const PRODUCT_NAME = 'Ogun'
const PAGE_SIZE = 100

const DESIRED_PLANS = [
  {
    envName: 'IYZICO_SINGLE_MONTHLY_PLAN_REFERENCE_CODE',
    name: 'Ogun Single Monthly',
    price: 2500,
    paymentInterval: 'MONTHLY',
  },
  {
    envName: 'IYZICO_SINGLE_YEARLY_PLAN_REFERENCE_CODE',
    name: 'Ogun Single Yearly',
    price: 28000,
    paymentInterval: 'YEARLY',
  },
  {
    envName: 'IYZICO_TEAM_MONTHLY_PLAN_REFERENCE_CODE',
    name: 'Ogun Team Monthly',
    price: 3000,
    paymentInterval: 'MONTHLY',
  },
  {
    envName: 'IYZICO_TEAM_YEARLY_PLAN_REFERENCE_CODE',
    name: 'Ogun Team Yearly',
    price: 30000,
    paymentInterval: 'YEARLY',
  },
] as const

interface ProductRecord {
  referenceCode?: string
  name?: string
}

interface PricingPlanRecord {
  referenceCode?: string
  name?: string
  price?: number | string
  currencyCode?: string
  paymentInterval?: string
  paymentIntervalCount?: number
  planPaymentType?: string
  recurrenceCount?: number | null
}

interface SdkResponse<T> {
  status?: string
  errorCode?: string
  errorMessage?: string
  data?: T
}

type SdkOperation = (
  request: Record<string, unknown>,
  callback: (error: unknown, result: SdkResponse<unknown>) => void,
) => void

function sdkCall<T>(operation: SdkOperation, request: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    operation(request, (error, result) => {
      if (error) {
        reject(error)
        return
      }
      if (result?.status !== 'success') {
        const suffix = result?.errorCode ? ` [${result.errorCode}]` : ''
        reject(new Error(`${result?.errorMessage ?? 'iyzico isteği başarısız.'}${suffix}`))
        return
      }
      resolve(result.data as T)
    })
  })
}

function listFromPayload<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]
  if (!value || typeof value !== 'object') return []
  const record = value as Record<string, unknown>
  for (const key of ['items', 'content', 'products', 'pricingPlans']) {
    if (Array.isArray(record[key])) return record[key] as T[]
  }
  return []
}

async function listAll<T>(operation: SdkOperation, extra: Record<string, unknown> = {}) {
  const rows: T[] = []
  for (let page = 1; page <= 50; page += 1) {
    const data = await sdkCall<unknown>(operation, {
      locale: 'tr',
      conversationId: 'ogun-sandbox-setup',
      page,
      count: PAGE_SIZE,
      ...extra,
    })
    const pageRows = listFromPayload<T>(data)
    rows.push(...pageRows)
    if (pageRows.length < PAGE_SIZE) break
  }
  return rows
}

function requireReference(value: { referenceCode?: string } | undefined, label: string): string {
  if (!value?.referenceCode) throw new Error(`${label} için referenceCode alınamadı.`)
  return value.referenceCode
}

function matchesPlan(actual: PricingPlanRecord, expected: (typeof DESIRED_PLANS)[number]) {
  return (
    actual.name === expected.name &&
    Number(actual.price) === expected.price &&
    actual.currencyCode === 'TRY' &&
    actual.paymentInterval === expected.paymentInterval &&
    Number(actual.paymentIntervalCount ?? 1) === 1 &&
    actual.planPaymentType === 'RECURRING' &&
    (actual.recurrenceCount === undefined || actual.recurrenceCount === null)
  )
}

async function main() {
  const credentials = getIyzicoSandboxCredentials()
  if (credentials.baseUrl !== IYZICO_SANDBOX_BASE_URL)
    throw new Error('Sandbox güvenlik kontrolü başarısız.')

  const iyzipay = new Iyzipay({
    apiKey: credentials.apiKey,
    secretKey: credentials.secretKey,
    uri: credentials.baseUrl,
  })
  const retrieveProducts = iyzipay.subscriptionProduct.retrieveList.bind(
    iyzipay.subscriptionProduct,
  ) as SdkOperation
  const createProduct = iyzipay.subscriptionProduct.create.bind(
    iyzipay.subscriptionProduct,
  ) as SdkOperation
  const retrievePlans = iyzipay.subscriptionPricingPlan.retrieveList.bind(
    iyzipay.subscriptionPricingPlan,
  ) as SdkOperation
  const createPlan = iyzipay.subscriptionPricingPlan.create.bind(
    iyzipay.subscriptionPricingPlan,
  ) as SdkOperation

  let products = await listAll<ProductRecord>(retrieveProducts)
  let product = products.find((item) => item.name === PRODUCT_NAME)
  let productStatus: 'existing' | 'created' = 'existing'
  if (!product) {
    product = await sdkCall<ProductRecord>(createProduct, {
      locale: 'tr',
      conversationId: 'ogun-sandbox-setup',
      name: PRODUCT_NAME,
    })
    productStatus = 'created'
  }

  const productReferenceCode = requireReference(product, PRODUCT_NAME)
  let plans = await listAll<PricingPlanRecord>(retrievePlans, { productReferenceCode })
  const results: Array<{
    envName: string
    name: string
    referenceCode: string
    status: 'existing' | 'created'
  }> = []

  for (const desired of DESIRED_PLANS) {
    const sameName = plans.find((plan) => plan.name === desired.name)
    if (sameName && !matchesPlan(sameName, desired)) {
      throw new Error(
        `${desired.name} aynı adla mevcut ancak fiyat/periyot özellikleri beklenen değerlerle eşleşmiyor.`,
      )
    }
    if (sameName) {
      results.push({
        envName: desired.envName,
        name: desired.name,
        referenceCode: requireReference(sameName, desired.name),
        status: 'existing',
      })
      continue
    }

    const created = await sdkCall<PricingPlanRecord>(createPlan, {
      locale: 'tr',
      conversationId: 'ogun-sandbox-setup',
      productReferenceCode,
      name: desired.name,
      price: desired.price,
      currencyCode: 'TRY',
      paymentInterval: desired.paymentInterval,
      paymentIntervalCount: 1,
      planPaymentType: 'RECURRING',
    })
    results.push({
      envName: desired.envName,
      name: desired.name,
      referenceCode: requireReference(created, desired.name),
      status: 'created',
    })
  }

  products = await listAll<ProductRecord>(retrieveProducts)
  if (
    !products.some(
      (item) => item.referenceCode === productReferenceCode && item.name === PRODUCT_NAME,
    )
  )
    throw new Error(`${PRODUCT_NAME} Sandbox'tan geri okunarak doğrulanamadı.`)

  plans = await listAll<PricingPlanRecord>(retrievePlans, { productReferenceCode })
  for (const desired of DESIRED_PLANS) {
    const verified = plans.find((plan) => matchesPlan(plan, desired))
    if (!verified?.referenceCode)
      throw new Error(`${desired.name} Sandbox'tan geri okunarak doğrulanamadı.`)
    const result = results.find((item) => item.name === desired.name)!
    result.referenceCode = verified.referenceCode
  }

  console.log(`PRODUCT ${PRODUCT_NAME} ${productStatus} ${productReferenceCode}`)
  for (const result of results)
    console.log(`PLAN ${result.name} ${result.status} ${result.referenceCode}`)
  console.log(`IYZICO_PRODUCT_REFERENCE_CODE=${productReferenceCode}`)
  for (const result of results) console.log(`${result.envName}=${result.referenceCode}`)
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Bilinmeyen iyzico hatası.'
  if (/subscription|abonelik|inactive|yetki|permission|unauthoriz|\[100001\]/i.test(message)) {
    console.error('iyzico Sandbox hesabında Subscription özelliğinin aktifleştirilmesi gerekiyor.')
  }
  console.error(message)
  process.exitCode = 1
})

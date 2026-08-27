import { createHmac, randomBytes } from 'node:crypto'

export const IYZICO_SANDBOX_BASE_URL = 'https://sandbox-api.iyzipay.com'

export interface IyzicoCredentials {
  apiKey: string
  secretKey: string
  baseUrl: typeof IYZICO_SANDBOX_BASE_URL
}

export interface IyzicoApiEnvelope<T> {
  status?: 'success' | 'failure'
  errorMessage?: string
  errorCode?: string
  token?: string
  checkoutFormContent?: string
  data?: T
}

function required(source: NodeJS.ProcessEnv, name: string): string {
  const value = source[name]?.trim()
  if (!value) throw new Error(`${name} ortam değişkeni tanımlı değil.`)
  return value
}

/** Sandbox dışındaki iyzico hostlarına ulaşmayı kod seviyesinde engeller. */
export function getIyzicoSandboxCredentials(
  source: NodeJS.ProcessEnv = process.env,
): IyzicoCredentials {
  const baseUrl = required(source, 'IYZICO_BASE_URL').replace(/\/$/, '')
  if (baseUrl !== IYZICO_SANDBOX_BASE_URL) {
    throw new Error(
      `Güvenlik nedeniyle IYZICO_BASE_URL yalnızca ${IYZICO_SANDBOX_BASE_URL} olabilir.`,
    )
  }

  const apiKey = required(source, 'IYZICO_API_KEY')
  const secretKey = required(source, 'IYZICO_SECRET_KEY')
  if (
    !apiKey.toLowerCase().startsWith('sandbox-') ||
    !secretKey.toLowerCase().startsWith('sandbox-')
  ) {
    throw new Error(
      'iyzico kimlik bilgileri Sandbox anahtarlarına benzemiyor; API isteği durduruldu.',
    )
  }
  return { apiKey, secretKey, baseUrl: IYZICO_SANDBOX_BASE_URL }
}

export function buildIyzicoV2Authorization(input: {
  path: string
  body: string
  apiKey: string
  secretKey: string
  randomKey?: string
}) {
  const randomKey = input.randomKey ?? `${Date.now()}${randomBytes(8).toString('hex')}`
  const signature = createHmac('sha256', input.secretKey)
    .update(randomKey + input.path + input.body, 'utf8')
    .digest('hex')
  const encoded = Buffer.from(
    `apiKey:${input.apiKey}&randomKey:${randomKey}&signature:${signature}`,
    'utf8',
  ).toString('base64')
  return { authorization: `IYZWSv2 ${encoded}`, randomKey }
}

export async function iyzicoSandboxRequest<T>(
  path: string,
  init: { method: 'GET' | 'POST'; body?: unknown },
): Promise<IyzicoApiEnvelope<T>> {
  const credentials = getIyzicoSandboxCredentials()
  // Resmî iyzipay-node SDK'sı GET dahil her V2 isteğinde body yoksa `{}`
  // nesnesini JSON.stringify ederek imzaya "{}" olarak dahil eder.
  const body = JSON.stringify(init.body ?? {})
  const url = new URL(path, credentials.baseUrl)
  if (url.origin !== credentials.baseUrl)
    throw new Error('iyzico isteği Sandbox origin’i dışına çıkamaz.')
  const auth = buildIyzicoV2Authorization({
    // iyzico IYZWSv2 imzası query string'i değil URI path'i kullanır.
    path: url.pathname,
    body,
    apiKey: credentials.apiKey,
    secretKey: credentials.secretKey,
  })
  const response = await fetch(url, {
    method: init.method,
    headers: {
      Authorization: auth.authorization,
      'x-iyzi-rnd': auth.randomKey,
      'Content-Type': 'application/json',
    },
    body: init.method === 'POST' ? body : undefined,
    cache: 'no-store',
  })
  const payload = (await response.json().catch(() => null)) as IyzicoApiEnvelope<T> | null
  if (!response.ok || !payload || payload.status !== 'success') {
    const code = payload?.errorCode ? ` [${payload.errorCode}]` : ''
    throw new Error(
      `${payload?.errorMessage || `iyzico isteği başarısız oldu (${response.status}).`}${code}`,
    )
  }
  return payload
}

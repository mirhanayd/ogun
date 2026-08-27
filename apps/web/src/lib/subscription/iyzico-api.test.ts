import { describe, expect, it } from 'vitest'
import {
  IYZICO_SANDBOX_BASE_URL,
  buildIyzicoV2Authorization,
  getIyzicoSandboxCredentials,
} from './iyzico-api'

const sandboxEnv = {
  NODE_ENV: 'test',
  IYZICO_API_KEY: 'sandbox-api-key',
  IYZICO_SECRET_KEY: 'sandbox-secret-key',
  IYZICO_BASE_URL: IYZICO_SANDBOX_BASE_URL,
} as NodeJS.ProcessEnv

describe('getIyzicoSandboxCredentials', () => {
  it('yalnız tam Sandbox URL ve Sandbox anahtarlarını kabul eder', () => {
    expect(getIyzicoSandboxCredentials(sandboxEnv).baseUrl).toBe(IYZICO_SANDBOX_BASE_URL)
  })

  it.each(['https://api.iyzipay.com', 'sandbox-api.iyzipay.com', 'https://example.com'])(
    'Sandbox dışı veya eksik URL’yi reddeder: %s',
    (baseUrl) => {
      expect(() =>
        getIyzicoSandboxCredentials({ ...sandboxEnv, IYZICO_BASE_URL: baseUrl }),
      ).toThrow(/yalnızca/)
    },
  )

  it('production görünümlü anahtarla istek yapılmasını engeller', () => {
    expect(() =>
      getIyzicoSandboxCredentials({ ...sandboxEnv, IYZICO_API_KEY: 'live-key' }),
    ).toThrow(/Sandbox/)
  })
})

describe('buildIyzicoV2Authorization', () => {
  it('deterministik randomKey ile IYZWSv2 başlığı üretir', () => {
    const result = buildIyzicoV2Authorization({
      path: '/v2/subscription/products',
      body: '',
      apiKey: 'sandbox-api-key',
      secretKey: 'sandbox-secret-key',
      randomKey: '123456789',
    })
    expect(result.randomKey).toBe('123456789')
    expect(result.authorization).toMatch(/^IYZWSv2 [A-Za-z0-9+/]+=*$/)
  })

  it('resmî iyzipay-node V2 test vektörüyle birebir aynı başlığı üretir', () => {
    const result = buildIyzicoV2Authorization({
      path: 'uri',
      body: '"body"',
      apiKey: 'api_key',
      secretKey: 'secret_key',
      randomKey: 'random_string',
    })
    expect(result.authorization).toBe(
      'IYZWSv2 YXBpS2V5OmFwaV9rZXkmcmFuZG9tS2V5OnJhbmRvbV9zdHJpbmcmc2lnbmF0dXJlOjAxNzUwODkyMWEyOWVlNTYwMWJjZDFmYmU4M2VmZDJlMmJlNDNhZjAyZWNlZmYzMGNmMmU5MWE1MzlhYWIzNTU=',
    )
  })
})

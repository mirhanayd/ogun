import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, request as playwrightRequest, test } from '@playwright/test'
import { loadE2eCredentials, loginAndEnsureOnboarded } from '../fixtures/auth'

const ADMIN_URL = `http://localhost:${process.env.SECURITY_ADMIN_PORT ?? '3301'}`
const operationsCredentials = JSON.parse(
  readFileSync(path.resolve(__dirname, '../fixtures/.operations-credentials.json'), 'utf8'),
) as { manager: { email: string; password: string } }

function expectSecurityHeaders(headers: Record<string, string>) {
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['x-frame-options']).toBe('DENY')
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
  expect(headers['permissions-policy']).toContain('camera=()')
  expect(headers['strict-transport-security']).toContain('max-age=31536000')
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'")
  expect(headers['content-security-policy']).not.toContain("'unsafe-eval'")
  expect(headers['content-security-policy']).not.toMatch(/(?:^|\s)\*(?:;|\s|$)/)
}

function expectSecureHostOnlyCookie(setCookie: string, prefix: string) {
  expect(setCookie).toContain(prefix)
  expect(setCookie).toMatch(/;\s*HttpOnly/i)
  expect(setCookie).toMatch(/;\s*Secure/i)
  expect(setCookie).toMatch(/;\s*SameSite=Lax/i)
  expect(setCookie).toMatch(/;\s*Path=\//i)
  expect(setCookie).not.toMatch(/;\s*Domain=/i)
}

test('production web and admin enforce security, cache and indexing headers', async ({ request }) => {
  const web = await request.get('/giris')
  expectSecurityHeaders(web.headers())

  const adminContext = await playwrightRequest.newContext({ baseURL: ADMIN_URL })
  try {
    const admin = await adminContext.get('/giris')
    expectSecurityHeaders(admin.headers())
    expect(admin.headers()['cache-control']).toContain('no-store')
    expect(admin.headers()['x-robots-tag']).toContain('noindex')

    const denied = await adminContext.get('/', { maxRedirects: 0 })
    expect([303, 307]).toContain(denied.status())
    expect(denied.headers().location).toContain('/giris')
  } finally {
    await adminContext.dispose()
  }
})

test('production auth cookies are Secure, HttpOnly, SameSite=Lax and host-only', async ({ request }) => {
  const webUser = loadE2eCredentials().clinicB
  const webLogin = await request.post('/api/auth/sign-in/email', {
    data: { email: webUser.email, password: webUser.password },
    headers: { origin: 'http://localhost:3300' },
  })
  expect(webLogin.ok()).toBe(true)
  expectSecureHostOnlyCookie(webLogin.headers()['set-cookie'] ?? '', 'better-auth')

  const adminContext = await playwrightRequest.newContext({ baseURL: ADMIN_URL })
  try {
    const adminLogin = await adminContext.post('/api/auth/sign-in/email', {
      data: operationsCredentials.manager,
      headers: { origin: ADMIN_URL },
    })
    expect(adminLogin.ok()).toBe(true)
    expectSecureHostOnlyCookie(adminLogin.headers()['set-cookie'] ?? '', 'ogun-admin')
  } finally {
    await adminContext.dispose()
  }
})

test('cross-origin browser mutations and unauthenticated internal jobs fail closed', async ({ request }) => {
  const mutation = await request.post('/api/analytics/event', {
    data: { eventName: 'screen_view', screen: 'security-smoke' },
    headers: { origin: 'https://attacker.invalid' },
  })
  expect(mutation.status()).toBe(403)
  await expect(mutation.json()).resolves.toMatchObject({ error: 'invalid_request_origin' })

  const adminContext = await playwrightRequest.newContext({ baseURL: ADMIN_URL })
  try {
    const adminAuth = await adminContext.post('/api/auth/sign-in/email', {
      data: operationsCredentials.manager,
      headers: { origin: 'https://attacker.invalid' },
    })
    expect(adminAuth.status()).toBe(403)
  } finally {
    await adminContext.dispose()
  }

  for (const authorization of [undefined, 'Bearer wrong-secret']) {
    const cron = await request.get('/api/internal/cron/subscription-reconciliation', {
      headers: authorization ? { authorization } : undefined,
    })
    expect([401, 404]).toContain(cron.status())
  }
})

test('health responses stay minimal and representative clinic pages have no CSP violations', async ({ page, request }) => {
  for (const endpoint of ['/api/health/live', '/api/health/ready']) {
    const response = await request.get(endpoint)
    const body = JSON.stringify(await response.json())
    expect(body).not.toMatch(/postgres|database_url|migration|hostname|provider/i)
  }

  const violations: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error' && /content security policy|refused to/i.test(message.text())) {
      violations.push(message.text())
    }
  })
  const user = loadE2eCredentials().clinicA
  await loginAndEnsureOnboarded(page, user.email, user.password)
  await page.goto('/ayarlar/destek')
  await expect(page).toHaveURL(/\/ayarlar\/destek/)
  expect(violations).toEqual([])
})

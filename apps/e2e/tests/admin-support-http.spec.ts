import { expect, test } from '@playwright/test'

test('admin support routes are live and keep the authentication boundary', async ({ request }) => {
  const login = await request.get('/giris', { maxRedirects: 0 })
  expect(login.status()).toBe(200)

  for (const path of ['/destek', '/destek/not-a-ticket']) {
    const response = await request.get(path, { maxRedirects: 0 })
    expect([303, 307]).toContain(response.status())
    expect(response.headers().location).toContain('/giris')
  }
})

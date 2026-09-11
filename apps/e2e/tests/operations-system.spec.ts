import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'

const credentials = JSON.parse(readFileSync(path.resolve(__dirname, '../fixtures/.operations-credentials.json'), 'utf8')) as Record<'manager' | 'reader' | 'denied', { email: string; password: string }>

function base32(value: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const character of value.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(character).toString(2).padStart(5, '0')
  const bytes: number[] = []
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(parseInt(bits.slice(index, index + 8), 2))
  return Buffer.from(bytes)
}
function totp(secret: string) {
  const buffer = Buffer.alloc(8)
  buffer.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)))
  const digest = createHmac('sha1', base32(secret)).update(buffer).digest()
  const offset = digest[digest.length - 1]! & 15
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}
async function login(page: Page, user: { email: string; password: string }) {
  await page.goto('/giris')
  await page.getByLabel('E-posta').fill(user.email)
  await page.getByLabel('Şifre').fill(user.password)
  await page.getByRole('button', { name: 'Giriş yap' }).click()
  await page.waitForURL(/guvenlik\/iki-asama-kurulum|\/iki-asama/)
  if (page.url().includes('iki-asama-kurulum')) {
    await page.getByLabel('Mevcut şifreniz').fill(user.password)
    await page.getByRole('button', { name: 'Kurulumu başlat' }).click()
    const uri = await page.locator('.secret').textContent()
    const secret = new URL(uri!).searchParams.get('secret')
    if (!secret) throw new Error('TOTP secret missing')
    await page.getByLabel('6 haneli doğrulama kodu').fill(totp(secret))
    await page.getByRole('button', { name: 'Doğrula ve etkinleştir' }).click()
    await page.waitForURL('http://localhost:3200/')
  }
}

test('system.read shows real job, warning and delivery aggregates', async ({ page }) => {
  await login(page, credentials.reader)
  await page.goto('/sistem')
  await expect(page.getByRole('heading', { name: 'Sistem Durumu' })).toBeVisible()
  await expect(page.getByText('E-posta Yeniden Deneme')).toBeVisible()
  await expect(page.getByText('E2E güvenli operasyon uyarısı.').first()).toBeVisible()
  await expect(page.getByText('Bekleyen e-posta')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Abonelik kontrolünü çalıştır' })).toHaveCount(0)
})

test('system.manage runs safe reconciliation and records history', async ({ page }) => {
  await login(page, credentials.manager)
  await page.goto('/sistem')
  await page.getByRole('button', { name: 'Abonelik kontrolünü çalıştır' }).click()
  await expect(page.getByText('Abonelik kontrolü tamamlandı.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Abonelik Kontrolü', exact: true }).first()).toBeVisible()
  await page.getByRole('link', { name: 'Tüm geçmiş' }).click()
  await expect(page.getByText('subscription_reconciliation').first()).toBeVisible()
})

test('role without system.read is denied', async ({ page }) => {
  await login(page, credentials.denied)
  await page.goto('/sistem')
  await expect(page.getByRole('heading', { name: 'Erişim reddedildi' })).toBeVisible()
})

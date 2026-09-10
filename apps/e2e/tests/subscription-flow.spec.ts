import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'

interface Credentials {
  billing: { email: string; password: string }
  support: { email: string; password: string }
  trialClinic: { id: string; name: string }
  externalClinic: { id: string; name: string }
}
const credentials = JSON.parse(
  readFileSync(path.resolve(__dirname, '../fixtures/.subscription-credentials.json'), 'utf8'),
) as Credentials

function base32(value: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const character of value.replace(/=+$/, '').toUpperCase())
    bits += alphabet.indexOf(character).toString(2).padStart(5, '0')
  const bytes: number[] = []
  for (let index = 0; index + 8 <= bits.length; index += 8)
    bytes.push(parseInt(bits.slice(index, index + 8), 2))
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
    if (!secret) throw new Error('TOTP secret is missing')
    await page.getByLabel('6 haneli doğrulama kodu').fill(totp(secret))
    await page.getByRole('button', { name: 'Doğrula ve etkinleştir' }).click()
    await page.waitForURL('http://localhost:3200/')
  }
}

test('billing_ops manages manual subscription safely and support is denied', async ({
  page,
  browser,
}) => {
  await login(page, credentials.billing)
  await page.getByRole('link', { name: 'Abonelikler' }).click()
  await expect(page).toHaveURL(/\/abonelikler/)
  await page.getByLabel('Arama').fill(credentials.trialClinic.name)
  await page.getByRole('button', { name: 'Filtrele' }).click()
  await page.getByRole('link', { name: credentials.trialClinic.name }).click()

  const trialForm = page.getByRole('heading', { name: 'Denemeyi uzat' }).locator('..')
  await trialForm.getByLabel('Gerekçe').fill('E2E deneme uzatma gerekçesi')
  await trialForm.getByRole('button', { name: 'Denemeyi uzat' }).click()
  await expect(page.getByText('Deneme süresi uzatıldı.')).toBeVisible()
  await expect(page.getByText('trial_extended')).toBeVisible()

  const activateForm = page
    .getByRole('heading', { name: 'Manuel aboneliği aktive et' })
    .locator('..')
  await activateForm.getByLabel('Gerekçe').fill('E2E manuel aktivasyon')
  await activateForm.getByRole('button', { name: 'Aktive et' }).click()
  await expect(page.getByText('Manuel abonelik aktive edildi.')).toBeVisible()

  const planForm = page.getByRole('heading', { name: 'Plan değiştir' }).locator('..')
  await planForm.getByLabel('Yeni plan').selectOption('klinik')
  await planForm.getByLabel('Gerekçe').fill('E2E plan yükseltme')
  await planForm.getByRole('button', { name: 'Planı değiştir' }).click()
  await expect(page.getByText('Plan güncellendi.')).toBeVisible()
  await expect(page.getByText(/Yönetici \+ 4 Diyetisyen/).first()).toBeVisible()

  const cancelForm = page.getByRole('heading', { name: 'Dönem sonunda iptal et' }).locator('..')
  await cancelForm.getByLabel('Gerekçe').fill('E2E dönem sonu iptal')
  await cancelForm.getByRole('button', { name: 'İptal talebi oluştur' }).click()
  await expect(page.getByText('İptal talebi kaydedildi.')).toBeVisible()
  const revertForm = page.getByRole('heading', { name: 'İptal talebini geri al' }).locator('..')
  await revertForm.getByLabel('Gerekçe').fill('E2E iptal geri alma')
  await revertForm.getByRole('button', { name: 'Talebi geri al' }).click()
  await expect(page.getByText('İptal talebi geri alındı.')).toBeVisible()

  await page.goto(`/abonelikler/${credentials.externalClinic.id}`)
  await expect(page.getByText('Harici sağlayıcı yönetimi')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Planı değiştir' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Durumu düzelt' })).toHaveCount(0)

  const supportContext = await browser.newContext()
  const supportPage = await supportContext.newPage()
  await login(supportPage, credentials.support)
  await supportPage.goto('/abonelikler')
  await expect(supportPage.getByRole('heading', { name: 'Erişim reddedildi' })).toBeVisible()
  await supportContext.close()
})

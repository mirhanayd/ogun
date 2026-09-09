import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'

interface Credentials {
  admin: { email: string; password: string }
  suffix: string
  publishedFoodName: string
  draftFoodName: string
  recipeName: string
  nutrientIds: Record<string, string>
}

const credentials = JSON.parse(
  readFileSync(path.resolve(__dirname, '../fixtures/.food-catalog-credentials.json'), 'utf8'),
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

async function loginFoodEditor(page: Page) {
  await page.goto('/giris')
  await page.getByLabel('E-posta').fill(credentials.admin.email)
  await page.getByLabel('Şifre').fill(credentials.admin.password)
  await page.getByRole('button', { name: 'Giriş yap' }).click()
  await page.waitForURL(/guvenlik\/iki-asama-kurulum|\/iki-asama/)
  if (page.url().includes('iki-asama-kurulum')) {
    await page.getByLabel('Mevcut şifreniz').fill(credentials.admin.password)
    await page.getByRole('button', { name: 'Kurulumu başlat' }).click()
    const uri = await page.locator('.secret').textContent()
    const secret = new URL(uri!).searchParams.get('secret')
    if (!secret) throw new Error('TOTP secret is missing')
    await page.getByLabel('6 haneli doğrulama kodu').fill(totp(secret))
    await page.getByRole('button', { name: 'Doğrula ve etkinleştir' }).click()
    await page.waitForURL('http://localhost:3200/')
  }
}

async function createDraftFood(page: Page, name: string) {
  await page.goto('/besinler/yeni')
  await page.getByLabel('Türkçe ad *').fill(name)
  await page.getByRole('button', { name: 'Taslak oluştur' }).click()
  await page.waitForURL(/\/besinler\/[^/?]+/)
}

test('food_editor publishes canonical food and recipe while user search hides drafts', async ({
  page,
  browser,
}) => {
  await loginFoodEditor(page)
  await expect(page.getByRole('link', { name: 'Besinler' }).first()).toBeVisible()

  await createDraftFood(page, credentials.publishedFoodName)
  const values: Record<string, string> = {
    ENERC_KCAL: '120',
    PROCNT: '10',
    CHOCDF: '20',
    FAT: '4',
    VITC: '2.5',
  }
  for (const [code, value] of Object.entries(values))
    await page.locator(`input[name="nutrient:${credentials.nutrientIds[code]}"]`).fill(value)
  await page.getByRole('button', { name: 'Besin öğelerini kaydet' }).click()
  await expect(page.getByText('Besin öğeleri kaydedildi.')).toBeVisible()

  await page.locator('input[name="portionLabel"]').last().fill('1 porsiyon')
  await page.locator('input[name="portionGrams"]').last().fill('100')
  await page.locator('input[name="defaultIndex"][value="0"]').check()
  await page.getByRole('button', { name: 'Porsiyonları kaydet' }).click()
  await expect(page.getByText('Porsiyonlar kaydedildi.')).toBeVisible()

  await page.getByPlaceholder('Kaynak başlığı').fill('E2E canonical source')
  await page.getByPlaceholder('Citation').fill('E2E controlled catalog fixture')
  await page.getByRole('button', { name: 'Kaynak ekle' }).click()
  await expect(page.getByText('Kaynak eklendi.')).toBeVisible()
  await page.getByRole('button', { name: 'Kontrole gönder' }).click()
  await page.getByRole('button', { name: 'Yayınla' }).click()
  await expect(page.locator('.header-badges .badge').first()).toHaveText('published')

  await createDraftFood(page, credentials.draftFoodName)

  await page.goto('/tarifler/yeni')
  await page.getByLabel('Tarif adı *').fill(credentials.recipeName)
  await page.getByLabel('Porsiyon sayısı *').fill('2')
  await page.getByLabel('Pişmiş toplam ağırlık (g) *').fill('200')
  await page.getByLabel('Pişirme yöntemi').fill('e2e-unknown-method')
  await page.getByRole('button', { name: 'Taslak tarif oluştur' }).click()
  await page.waitForURL(/\/tarifler\/[^/?]+/)
  await page.getByLabel('Besin ara').fill(credentials.publishedFoodName)
  await page.getByRole('button', { name: 'Ara', exact: true }).click()
  await page.locator('input[name="newFoodId"]').check()
  await page.getByPlaceholder('Yeni malzeme gramı').fill('200')
  await page.getByRole('button', { name: 'Malzemeleri kaydet' }).click()
  await expect(page.getByText('ENERC_KCAL')).toBeVisible()
  await expect(page.getByText('240.0000')).toBeVisible()
  await expect(page.getByText(/retention factor/i)).toBeVisible()

  await page.getByPlaceholder('Kaynak başlığı').fill('E2E recipe source')
  await page.getByPlaceholder('Citation').fill('E2E system recipe fixture')
  await page.getByRole('button', { name: 'Kaynak ekle' }).click()
  await page.getByRole('button', { name: 'Kontrole gönder' }).click()
  await page.getByRole('button', { name: 'Yayınla' }).click()
  await expect(page.getByText('Public', { exact: true })).toBeVisible()

  const userContext = await browser.newContext({ baseURL: 'http://localhost:3100' })
  const userPage = await userContext.newPage()
  const response = await userPage.goto(
    `/api/foods/search?q=${encodeURIComponent(credentials.suffix)}`,
  )
  expect(response?.ok()).toBe(true)
  const body = (await userPage.locator('body').textContent()) ?? ''
  expect(body).toContain(credentials.publishedFoodName)
  expect(body).not.toContain(credentials.draftFoodName)
  await userContext.close()
})

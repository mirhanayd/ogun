import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test, type Browser, type Page } from '@playwright/test'

interface Credentials {
  admin: { email: string; password: string }
  existing: { email: string; password: string }
  newReviewer: { email: string; password: string }
  revokedReviewer: { email: string }
  taskIds: string[]
}
const credentials = JSON.parse(
  readFileSync(path.resolve(__dirname, '../fixtures/.clinical-review-credentials.json'), 'utf8'),
) as Credentials
const capturePath = path.resolve(__dirname, '../fixtures/.clinical-review-invite.json')
function base32(value: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const c of value.replace(/=+$/, '').toUpperCase())
    bits += alphabet.indexOf(c).toString(2).padStart(5, '0')
  const bytes = []
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2))
  return Buffer.from(bytes)
}
function totp(secret: string) {
  const counter = Math.floor(Date.now() / 30_000)
  const buffer = Buffer.alloc(8)
  buffer.writeBigUInt64BE(BigInt(counter))
  const digest = createHmac('sha1', base32(secret)).update(buffer).digest()
  const offset = digest[digest.length - 1]! & 15
  const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000
  return String(value).padStart(6, '0')
}
async function loginClinicalOps(page: Page) {
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
    if (!secret) throw new Error('TOTP secret missing')
    await page.getByLabel('6 haneli doğrulama kodu').fill(totp(secret))
    await page.getByRole('button', { name: 'Doğrula ve etkinleştir' }).click()
    await page.waitForURL('http://localhost:3200/')
  }
}
async function readCapture(page: Page, email: string) {
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      const capture = JSON.parse(readFileSync(capturePath, 'utf8')) as {
        invitationUrl: string
        to: string
      }
      if (capture.to === email) return capture
    } catch {}
    await page.waitForTimeout(100)
  }
  throw new Error('Invitation capture was not written')
}
async function createInvite(
  page: Page,
  input: { email: string; name: string; preverified: boolean; preassign?: boolean },
) {
  await page.goto('/clinical-inceleme/davetler/yeni')
  await page.getByLabel('Ad soyad').fill(input.name)
  await page.getByLabel('E-posta').fill(input.email)
  await page.locator('select[name="professionalRole"]').selectOption('pharmacist')
  await page.getByLabel('Uzmanlık alanı').fill('Klinik Eczacılık')
  await page.locator('input[name="capabilities"][value="medication_food"]').check()
  if (input.preverified)
    await page.locator('input[name="professionalVerificationConfirmed"]').check()
  await page.getByRole('button', { name: 'Daveti oluştur ve gönder' }).click()
  await page.waitForURL(/\/clinical-inceleme\/davetler\//)
  const capture = await readCapture(page, input.email)
  if (input.preassign) {
    await page
      .getByLabel('Arama')
      .fill(
        credentials.taskIds[0]!.replace('e2e-review-task', 'e2e-candidate').replace(/-\d+$/, ''),
      )
    await page.getByRole('button', { name: 'Filtrele' }).click()
    for (const taskId of credentials.taskIds)
      await page.locator(`input[name="taskIds"][value="${taskId}"]`).check()
    await page.getByRole('button', { name: 'Seçilenleri ata' }).click()
    await expect(page.getByText('2 görev ayrıldı')).toBeVisible()
  }
  return capture.invitationUrl
}
async function webPage(browser: Browser) {
  const context = await browser.newContext()
  return { context, page: await context.newPage() }
}

test('clinical_ops invites, preassigns and activates new/existing reviewers with secure token states', async ({
  page,
  browser,
}) => {
  await loginClinicalOps(page)
  const newUrl = await createInvite(page, {
    email: credentials.newReviewer.email,
    name: 'New Reviewer',
    preverified: true,
    preassign: true,
  })
  const fresh = await webPage(browser)
  await fresh.page.goto(newUrl)
  await fresh.page.getByLabel('Şifre', { exact: true }).fill(credentials.newReviewer.password)
  await fresh.page.getByLabel('Şifre tekrar').fill(credentials.newReviewer.password)
  await fresh.page.getByRole('button', { name: 'Hesabı oluştur ve daveti kabul et' }).click()
  await fresh.page.waitForURL('**/clinical-review')
  await expect(fresh.page.getByText('2')).toBeVisible()
  await fresh.page
    .getByRole('link', { name: /Bana Atananlar/ })
    .first()
    .click()
  for (const taskId of credentials.taskIds)
    await expect(fresh.page.getByText(taskId.replace('review-task', 'candidate'))).toBeVisible()
  await fresh.page.goto(newUrl)
  await expect(fresh.page.getByText('Bu davet daha önce kullanılmış.')).toBeVisible()
  await fresh.context.close()
  const existingUrl = await createInvite(page, {
    email: credentials.existing.email,
    name: 'Existing Reviewer',
    preverified: false,
  })
  const existing = await webPage(browser)
  await existing.page.goto(existingUrl)
  await existing.page.getByRole('link', { name: 'Giriş yap' }).click()
  await existing.page.getByLabel('E-posta').fill(credentials.existing.email)
  await existing.page.getByLabel('Şifre', { exact: true }).fill(credentials.existing.password)
  await existing.page.getByRole('button', { name: 'Giriş yap' }).click()
  await existing.page.waitForURL(/clinical-review\/davet/)
  await existing.page.getByRole('button', { name: 'Daveti kabul et' }).click()
  await existing.page.waitForURL('**/clinical-review')
  await expect(existing.page.getByText('Clinical reviewer durumu')).toBeVisible()
  await expect(existing.page.getByText('pending')).toBeVisible()
  await existing.context.close()
  const revokeUrl = await createInvite(page, {
    email: credentials.revokedReviewer.email,
    name: 'Revoked Reviewer',
    preverified: true,
  })
  const wrong = await webPage(browser)
  const invitation = new URL(revokeUrl)
  const invitationPath = invitation.pathname + invitation.search
  await wrong.page.goto(
    new URL(`/giris?next=${encodeURIComponent(invitationPath)}`, invitation.origin).toString(),
  )
  await wrong.page.getByLabel('E-posta').fill(credentials.existing.email)
  await wrong.page.getByLabel('Şifre', { exact: true }).fill(credentials.existing.password)
  await wrong.page.getByRole('button', { name: 'Giriş yap' }).click()
  await wrong.page.waitForURL(/clinical-review\/davet/)
  await expect(wrong.page.getByText('Farklı bir hesapla oturum açtınız.')).toBeVisible()
  await wrong.context.close()
  await page.getByPlaceholder('İptal nedeni').fill('E2E revoke kontrolü')
  await page.getByRole('button', { name: 'Davet iptal et' }).click()
  const revoked = await webPage(browser)
  await revoked.page.goto(revokeUrl)
  await expect(revoked.page.getByText('Bu davet iptal edilmiş.')).toBeVisible()
  await revoked.context.close()
})

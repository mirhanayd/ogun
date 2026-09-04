import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright-core'

const endpoint = process.env.OGUN_TAURI_CDP ?? 'http://127.0.0.1:9333'
const outputDirectory = resolve('dist', 'production-smoke')
await mkdir(outputDirectory, { recursive: true })

const browser = await chromium.connectOverCDP(endpoint)
const context = browser.contexts()[0]
const page = context?.pages()[0]
if (!page) throw new Error(`No packaged Tauri WebView page at ${endpoint}`)

const consoleErrors = []
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text())
})
page.on('pageerror', (error) => consoleErrors.push(error.message))

await page.waitForLoadState('domcontentloaded')
const packagedUrl = new URL(page.url())
assert.notEqual(packagedUrl.protocol, 'file:', 'smoke must run in the packaged Tauri protocol')

const screenshots = []
async function openScenario(name) {
  const target = new URL(packagedUrl)
  target.search = new URLSearchParams({ 'layout-smoke': name }).toString()
  await page.goto(target.href, { waitUntil: 'domcontentloaded' })
}

async function capture(order, name) {
  const path = resolve(outputDirectory, `${String(order).padStart(2, '0')}-${name}.png`)
  await page.screenshot({ path, fullPage: true })
  screenshots.push(path)
}

await openScenario('login')
await page.locator('[data-desktop-login-form]').waitFor()
assert.equal(await page.getByLabel('E-posta').count(), 1)
assert.equal(await page.getByLabel('Şifre').count(), 1)
await page.getByText('Bu cihazdaki kayıtlı hesaplar', { exact: true }).waitFor()
await capture(1, 'login-email-password-saved-account')

await openScenario('offline-login')
await page.getByRole('button', { name: 'Giriş yap', exact: true }).click()
await page.getByText(
  'İnternet bağlantısı yok. Bu cihazda daha önce kullandığınız kayıtlı bir hesap varsa PIN ile giriş yapabilirsiniz.',
  { exact: true },
).waitFor()
assert.equal(
  await page.locator('[data-saved-accounts]').evaluate((element) => element.contains(document.activeElement)),
  true,
  'offline submit did not focus the saved-account path',
)
await capture(2, 'offline-login-notice')

await openScenario('anamnesis')
await page.locator('[data-smoke-anamnesis]').waitFor()
await page.getByRole('list', { name: 'Seçili hastalıklar' }).getByText('Diyabet', { exact: true }).waitFor()
assert.doesNotMatch(await page.locator('#conditions').inputValue(), /Diyabet/i)
await capture(3, 'anamnesis-canonical-condition')

await openScenario('disease-search')
await page.getByRole('combobox', { name: 'Hastalık kataloğundan seçim yap' }).click()
await page.locator('[data-slot="popover-content"] [data-slot="command-input"]').fill('diy')
await page.getByText('Tip 2 Diyabet', { exact: true }).waitFor()
await capture(4, 'offline-disease-search')

await openScenario('medication-search')
await page.getByRole('tab', { name: 'İlaçlar' }).click()
await page.getByRole('combobox', { name: 'İlaç kataloğundan seçim yap' }).click()
const medicationSearch = page.locator('[data-slot="popover-content"] [data-slot="command-input"]')
await medicationSearch.fill('parol')
await page.getByText('PAROL 500 MG TABLET', { exact: true }).last().waitFor()
await capture(5, 'offline-medication-search')
await medicationSearch.fill('metfor')
await page.getByText('Metformin', { exact: true }).waitFor()

await openScenario('settings-logo')
const settingsLogo = page.getByRole('img', { name: 'Klinik logosu önizlemesi' })
await settingsLogo.waitFor()
assert.equal(
  await settingsLogo.evaluate((image) => image.complete && image.naturalWidth > 0),
  true,
  'clinic logo did not load',
)
await capture(6, 'settings-clinic-logo')

await openScenario('settings-color')
await page.locator('#clinic-primary-color').waitFor()
assert.equal(await page.locator('#clinic-primary-color').inputValue(), '#6D4AFF')
const primaryBeforeRestart = await page.locator('[data-clinic-branding]').evaluate((element) =>
  getComputedStyle(element).getPropertyValue('--primary').trim(),
)
assert.ok(primaryBeforeRestart, 'custom primary color was not applied to the shell')
await capture(7, 'settings-custom-brand-color')

await openScenario('settings-restart')
assert.equal(await page.locator('#clinic-primary-color').inputValue(), '#6D4AFF')
assert.equal(
  await page.locator('[data-clinic-branding]').evaluate((element) =>
    getComputedStyle(element).getPropertyValue('--primary').trim(),
  ),
  primaryBeforeRestart,
)
assert.equal(
  await page.getByRole('img', { name: 'Klinik logosu önizlemesi' }).evaluate(
    (image) => image.complete && image.naturalWidth > 0,
  ),
  true,
)
await capture(8, 'restart-same-branding')

await openScenario('clients')
await page.getByRole('heading', { name: 'Danışanlar', exact: true }).waitFor()
assert.equal(await page.getByText('Yakında', { exact: true }).count(), 0)
await page.getByText(/77,2 kg/).first().waitFor()
await page.getByText('Dyt. Ada Demir', { exact: true }).last().waitFor()
await capture(9, 'clients-real-activity-dietitian')

await openScenario('assignment')
await page.getByRole('checkbox', { name: 'Deniz Yılmaz adlı danışanı seç' }).click()
await page.getByRole('button', { name: 'Diyetisyen ata' }).click()
await page.getByRole('dialog').getByRole('heading', { name: 'Diyetisyen ata' }).waitFor()
await page.getByText('Seçili 1 danışana atanacak diyetisyeni seçin.', { exact: true }).waitFor()
await capture(10, 'owner-dietitian-assignment-dialog')

await openScenario('search')
await page.keyboard.press('Control+K')
const visiblePanel = page.locator('[data-command-panel]:visible')
await visiblePanel.waitFor()
assert.equal(await page.locator('[data-command-panel]:visible').count(), 1)
assert.equal(await page.locator('[role="dialog"]:visible').count(), 0)
const focusedSearch = page.locator('[data-command-surface]:visible input:focus')
await focusedSearch.fill('Deniz')
await visiblePanel.getByText('Deniz Yılmaz', { exact: true }).waitFor()
const geometry = await page.locator('[data-command-surface]:has([data-command-panel]:visible)').evaluate(
  (surface) => {
    const trigger = surface.querySelector('[data-command-trigger]')
    const panel = surface.querySelector('[data-command-panel]')
    if (!trigger || !panel) throw new Error('command surface geometry is incomplete')
    return {
      triggerBottom: trigger.getBoundingClientRect().bottom,
      panelTop: panel.getBoundingClientRect().top,
      triggerWidth: trigger.getBoundingClientRect().width,
      panelWidth: panel.getBoundingClientRect().width,
    }
  },
)
assert.ok(geometry.panelTop >= geometry.triggerBottom)
assert.ok(Math.abs(geometry.panelWidth - geometry.triggerWidth) < 2)
await capture(11, 'search-anchored-under-topbar')
await page.keyboard.press('ArrowDown')
await page.keyboard.press('Enter')
await visiblePanel.waitFor({ state: 'hidden' })

const ignoredConsoleErrors = consoleErrors.filter((message) =>
  message.includes('[CommandPalette] besin indeksi yüklenemedi'),
)
const unexpectedConsoleErrors = consoleErrors.filter(
  (message) => !ignoredConsoleErrors.includes(message),
)
assert.deepEqual(unexpectedConsoleErrors, [], `console errors: ${unexpectedConsoleErrors.join('\n')}`)

console.log(
  JSON.stringify(
    {
      packagedUrl: packagedUrl.href,
      scenarios: 11,
      pinBoundary: 'covered by native Rust and auth-state tests',
      screenshots,
      ignoredConsoleErrors,
      unexpectedConsoleErrors,
    },
    null,
    2,
  ),
)
await browser.close()

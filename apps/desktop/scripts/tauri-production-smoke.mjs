import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { resolve } from 'node:path'

const endpoint = process.env.OGUN_TAURI_CDP ?? 'http://127.0.0.1:9333'
const profileEmail = process.env.OGUN_TEST_PROFILE_EMAIL
const testPin = process.env.OGUN_TEST_PIN
const offlineBoot = process.env.OGUN_TEST_OFFLINE === '1'
const browser = await chromium.connectOverCDP(endpoint)
const context = browser.contexts()[0]
const page = context?.pages()[0]
if (!page) throw new Error(`No Tauri WebView page at ${endpoint}`)
// Clear a prior CDP session's emulation. Offline cold-start uses a process-level
// unreachable proxy so the packaged tauri.localhost assets remain available.
if (offlineBoot) await context.setOffline(false)

const consoleErrors = []
page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
page.on('pageerror', (error) => consoleErrors.push(error.message))
await page.waitForLoadState('domcontentloaded')
await page.waitForFunction(() => document.body.innerText.includes('CİHAZ KİLİTLİ'), undefined, { timeout: 90_000 })

const boot = await page.evaluate(() => ({
  url: location.href,
  title: document.title,
  text: document.body.innerText.slice(0, 500),
  font: getComputedStyle(document.body).fontFamily,
  titlebar: getComputedStyle(document.querySelector('[data-desktop-titlebar]')).display,
  stylesheets: document.styleSheets.length,
  workspaceVisible: Boolean(document.querySelector('[data-app-shell]')),
}))
assert.equal(boot.workspaceVisible, false, 'workspace opened before PIN')
assert.match(boot.text, /CİHAZ KİLİTLİ/i)
await page.screenshot({ path: resolve('dist/tauri-production-pin.png') })

if (!profileEmail || !testPin) {
  console.log(JSON.stringify({ boot, pinGate: 'PASS', note: 'Set OGUN_TEST_PROFILE_EMAIL and OGUN_TEST_PIN for unlocked route smoke.' }, null, 2))
  await browser.close()
  process.exit(0)
}

const profileButton = page.getByRole('button').filter({ hasText: profileEmail })
await profileButton.waitFor()
await profileButton.click()
const pinInput = page.locator('input[type="password"][inputmode="numeric"]')
await pinInput.waitFor()

const wrongPin = testPin === '0000' ? '0001' : '0000'
await pinInput.fill(wrongPin)
await page.getByRole('button', { name: 'PIN ile hızlı giriş' }).click()
await page.getByText('PIN doğru değil.').waitFor()
assert.equal(await page.locator('[data-app-shell]').count(), 0, 'wrong PIN rendered workspace')
await page.screenshot({ path: resolve('dist/tauri-production-wrong-pin.png') })

await pinInput.fill(testPin)
await page.getByRole('button', { name: 'PIN ile hızlı giriş' }).click()
await page.locator('[data-app-shell]').waitFor()

const screenshots = []
async function capture(name) {
  const path = resolve(`dist/tauri-production-${name}.png`)
  await page.screenshot({ path, fullPage: true })
  screenshots.push(path)
}
async function navigate(href, ready) {
  await page.locator(`[data-sidebar-navigation-items] a[href="${href}"]`).click()
  await ready()
}

await page.getByText('Klinik özeti', { exact: true }).waitFor()
await capture('panel')
await navigate('/danisanlar', () => page.getByRole('heading', { name: 'Danışanlar', exact: true }).waitFor())
await capture('danisanlar')
const clientLink = page.locator('a[href^="/danisanlar/"]:not([href="/danisanlar/yeni"])').first()
const clientHref = await clientLink.getAttribute('href')
assert.match(clientHref ?? '', /^\/danisanlar\/[^/]+$/)
await clientLink.click()
await page.locator('[data-client-detail]').waitFor()
const clientName = await page.locator('[data-client-detail] h1').innerText()
await capture('danisan-genel')
await page.getByRole('tab', { name: 'Ölçümler' }).click()
await page.getByText('Hedef takibi').waitFor()
await capture('danisan-olcumler')
await page.getByRole('tab', { name: 'Anamnez' }).click()
await page.getByText('Sağlık geçmişi').waitFor()
await capture('danisan-anamnez')

await navigate('/planlar', () => page.getByRole('heading', { name: 'Planlar', exact: true }).waitFor())
await capture('planlar')
const planLink = page.locator('a[href^="/danisanlar/"][href*="/planlar/"]').first()
await planLink.waitFor()
await planLink.click()
await page.locator('[data-plan-editor]').waitFor()
await capture('plan-editor')
await navigate('/randevular', () => page.locator('[data-appointments-view]').waitFor())
await capture('randevular')
await navigate('/finans', () => page.locator('[data-finance-screen]').waitFor())
assert.equal(await page.getByText(/yerel veritabanından hazırlanıyor/i).count(), 0)
await capture('finans')
await navigate('/ayarlar', () => page.locator('[data-settings-screen]').waitFor())
assert.equal(await page.getByText(/yerel veritabanından hazırlanıyor/i).count(), 0)
await capture('ayarlar')

const commandTrigger = page.locator('[data-command-trigger]:visible').first()
await commandTrigger.click()
const commandInput = page.getByPlaceholder('Sayfa, ayar veya danışan arayın…')
await commandInput.fill(clientName.split(/\s+/)[0] ?? clientName)
await page.getByText(clientName, { exact: true }).waitFor()
await capture('command-search')
await page.keyboard.press('Escape')

const routeBeforeOffline = await page.evaluate(() => location.href)
await context.setOffline(true)
await page.waitForTimeout(500)
assert.equal(await page.evaluate(() => location.href), routeBeforeOffline, 'connectivity change altered route')
assert.equal(await page.locator('[data-settings-screen]').count(), 1, 'connectivity change replaced the screen tree')
await capture('ayarlar-offline')
await context.setOffline(false)

const expectedOfflineErrors = offlineBoot
  ? consoleErrors.filter((message) => message.includes('net::ERR_PROXY_CONNECTION_FAILED'))
  : []
const unexpectedErrors = consoleErrors.filter((message) => !expectedOfflineErrors.includes(message))
assert.deepEqual(unexpectedErrors, [], `console errors: ${unexpectedErrors.join('\n')}`)
console.log(JSON.stringify({ boot, offlineBoot, pinGate: 'PASS', wrongPin: 'PASS', unlock: 'PASS', screenshots, expectedOfflineErrors, unexpectedErrors }, null, 2))
await browser.close()

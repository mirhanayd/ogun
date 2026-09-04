import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, resolve, extname } from 'node:path'
import { test } from 'node:test'
import { chromium } from 'playwright-core'

const dist = resolve(import.meta.dirname, '..', 'dist')
const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' }

async function startServer() {
  await stat(join(dist, 'index.html'))
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      const relative = url.pathname === '/' ? 'index.html' : url.pathname.slice(1)
      const path = join(dist, relative)
      const body = await readFile(path)
      response.writeHead(200, { 'content-type': contentTypes[extname(path)] ?? 'application/octet-stream' }); response.end(body)
    } catch { response.writeHead(404); response.end('not found') }
  })
  await new Promise((resolveReady) => server.listen(0, '127.0.0.1', resolveReady))
  return { server, port: server.address().port }
}

function chromiumPath() {
  const local = process.env.LOCALAPPDATA
  const candidates = [
    local && join(local, 'ms-playwright', 'chromium_headless_shell-1234', 'chrome-headless-shell-win64', 'chrome-headless-shell.exe'),
    local && join(local, 'ms-playwright', 'chromium-1234', 'chrome-win64', 'chrome.exe'),
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean)
  return candidates
}

test('production bundle renders the shared desktop shell as a computed layout', async () => {
  const { server, port } = await startServer()
  let browser
  try {
    let lastError
    for (const executablePath of chromiumPath()) {
      try { browser = await chromium.launch({ executablePath, headless: true }); break } catch (error) { lastError = error }
    }
    if (!browser) throw lastError ?? new Error('Chromium executable not found')
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 })
    for (const route of ['panel', 'danisanlar', 'planlar']) {
      await page.goto(`http://127.0.0.1:${port}/?layout-smoke=${route}`, { waitUntil: 'networkidle' })
      await page.locator('[data-app-shell]').waitFor()
      const layout = await page.evaluate(() => {
        const shell = document.querySelector('[data-app-shell]')
        const sidebar = document.querySelector('[data-app-sidebar]')
        const main = document.querySelector('[data-app-main]')
        const navigation = document.querySelector('[data-sidebar-navigation]')
        const navigationItems = document.querySelector('[data-sidebar-navigation-items]')
        const brandImage = document.querySelector('[data-desktop-titlebar] img')
        if (!shell || !sidebar || !main || !navigation || !navigationItems) throw new Error('Shared shell selectors are missing')
        const sidebarRect = sidebar.getBoundingClientRect(); const mainRect = main.getBoundingClientRect()
        const panelGrid = document.querySelector('[data-app-main] section.grid')
        return {
          shellDisplay: getComputedStyle(shell).display,
          shellDirection: getComputedStyle(shell).flexDirection,
          shellHeight: shell.getBoundingClientRect().height,
          shellFont: getComputedStyle(shell).fontFamily,
          brandImageLoaded: brandImage instanceof HTMLImageElement && brandImage.complete && brandImage.naturalWidth > 0,
          sidebarDisplay: getComputedStyle(sidebar).display,
          sidebarWidth: sidebarRect.width,
          mainLeft: mainRect.left,
          sidebarRight: sidebarRect.right,
          navigationDirection: getComputedStyle(navigation).flexDirection,
          navigationItemsDirection: getComputedStyle(navigationItems).flexDirection,
          panelGridDisplay: panelGrid ? getComputedStyle(panelGrid).display : null,
          panelGridColumns: panelGrid ? getComputedStyle(panelGrid).gridTemplateColumns.split(' ').filter(Boolean).length : null,
        }
      })
      assert.equal(layout.shellDisplay, 'flex')
      assert.equal(layout.shellDirection, 'column')
      assert.ok(Math.abs(layout.shellHeight - 960) < 2, `shell height was ${layout.shellHeight}`)
      assert.match(layout.shellFont, /Inter|system-ui|Segoe UI/)
      assert.equal(layout.brandImageLoaded, true)
      assert.equal(layout.sidebarDisplay, 'flex')
      assert.ok(Math.abs(layout.sidebarWidth - 240) < 2, `sidebar width was ${layout.sidebarWidth}`)
      assert.ok(layout.mainLeft >= layout.sidebarRight, `main ${layout.mainLeft} overlaps sidebar ${layout.sidebarRight}`)
      assert.equal(layout.navigationDirection, 'column')
      assert.equal(layout.navigationItemsDirection, 'column')
      if (route === 'panel') { assert.equal(layout.panelGridDisplay, 'grid'); assert.ok(layout.panelGridColumns >= 2) }
      await page.screenshot({ path: join(dist, `layout-smoke-${route}.png`), fullPage: true })
    }

    await page.goto(`http://127.0.0.1:${port}/?layout-smoke=login`, { waitUntil: 'networkidle' })
    await page.locator('[data-desktop-login-form]').waitFor()
    assert.equal(await page.getByLabel('E-posta').count(), 1)
    assert.equal(await page.getByLabel('Şifre').count(), 1)
    await page.getByText('Bu cihazdaki kayıtlı hesaplar', { exact: true }).waitFor()

    await page.goto(`http://127.0.0.1:${port}/?layout-smoke=offline-login`, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Giriş yap', exact: true }).click()
    await page.getByText(
      'İnternet bağlantısı yok. Bu cihazda daha önce kullandığınız kayıtlı bir hesap varsa PIN ile giriş yapabilirsiniz.',
      { exact: true },
    ).waitFor()
    assert.equal(
      await page.locator('[data-saved-accounts]').evaluate((element) => element.contains(document.activeElement)),
      true,
    )

    await page.goto(`http://127.0.0.1:${port}/?layout-smoke=anamnesis`, { waitUntil: 'networkidle' })
    await page.getByRole('list', { name: 'Seçili hastalıklar' }).getByText('Diyabet', { exact: true }).waitFor()
    assert.doesNotMatch(await page.locator('#conditions').inputValue(), /Diyabet/i)

    await page.goto(`http://127.0.0.1:${port}/?layout-smoke=disease-search`, { waitUntil: 'networkidle' })
    await page.locator('[data-smoke-anamnesis]').waitFor()
    const conditionTrigger = page.getByRole('combobox', { name: 'Hastalık kataloğundan seçim yap' })
    await conditionTrigger.click()
    assert.equal(await conditionTrigger.getAttribute('aria-expanded'), 'true')
    await page.locator('[data-slot="popover-content"] [data-slot="command-input"]').fill('diy')
    await page.getByText('Tip 2 Diyabet', { exact: true }).waitFor()

    await page.goto(`http://127.0.0.1:${port}/?layout-smoke=medication-search`, { waitUntil: 'networkidle' })
    await page.getByRole('tab', { name: 'İlaçlar' }).click()
    await page.getByRole('combobox', { name: 'İlaç kataloğundan seçim yap' }).click()
    const medicationSearch = page.locator('[data-slot="popover-content"] [data-slot="command-input"]')
    await medicationSearch.fill('parol')
    await page.getByText('PAROL 500 MG TABLET', { exact: true }).last().waitFor()
    await medicationSearch.fill('metfor')
    await page.getByText('Metformin', { exact: true }).waitFor()

    await page.goto(`http://127.0.0.1:${port}/?layout-smoke=settings-logo`, { waitUntil: 'networkidle' })
    const settingsLogo = page.getByRole('img', { name: 'Klinik logosu önizlemesi' })
    await settingsLogo.waitFor()
    assert.equal(await settingsLogo.evaluate((image) => image.complete && image.naturalWidth > 0), true)
    assert.equal(await page.locator('#clinic-primary-color').inputValue(), '#6D4AFF')

    await page.goto(`http://127.0.0.1:${port}/?layout-smoke=clients`, { waitUntil: 'networkidle' })
    assert.equal(await page.getByText('Yakında', { exact: true }).count(), 0)
    await page.getByText(/77,2 kg/).first().waitFor()
    await page.getByText('Dyt. Ada Demir', { exact: true }).last().waitFor()

    await page.goto(`http://127.0.0.1:${port}/?layout-smoke=assignment`, { waitUntil: 'networkidle' })
    await page.getByRole('checkbox', { name: 'Deniz Yılmaz adlı danışanı seç' }).click()
    await page.getByRole('button', { name: 'Diyetisyen ata' }).click()
    await page.getByRole('dialog').getByRole('heading', { name: 'Diyetisyen ata' }).waitFor()

    await page.goto(`http://127.0.0.1:${port}/?layout-smoke=search`, { waitUntil: 'networkidle' })
    await page.keyboard.press('Control+K')
    const visiblePanel = page.locator('[data-command-panel]:visible')
    await visiblePanel.waitFor()
    assert.equal(await page.locator('[data-command-panel]:visible').count(), 1)
    assert.equal(await page.locator('[role="dialog"]:visible').count(), 0)
    const focusedSearch = page.locator('[data-command-surface]:visible input:focus')
    await focusedSearch.fill('Deniz')
    await visiblePanel.getByText('Deniz Yılmaz', { exact: true }).waitFor()
    const geometry = await page.locator('[data-command-surface]:has([data-command-panel]:visible)').evaluate((surface) => {
      const trigger = surface.querySelector('[data-command-trigger]')
      const panel = surface.querySelector('[data-command-panel]')
      if (!trigger || !panel) throw new Error('command surface geometry is incomplete')
      return {
        triggerBottom: trigger.getBoundingClientRect().bottom,
        panelTop: panel.getBoundingClientRect().top,
        triggerWidth: trigger.getBoundingClientRect().width,
        panelWidth: panel.getBoundingClientRect().width,
      }
    })
    assert.ok(geometry.panelTop >= geometry.triggerBottom)
    assert.ok(Math.abs(geometry.panelWidth - geometry.triggerWidth) < 2)
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await visiblePanel.waitFor({ state: 'hidden' })
  } finally {
    await browser?.close(); await new Promise((done) => server.close(done))
  }
})

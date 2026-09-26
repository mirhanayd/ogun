import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir, readFile, stat } from 'node:fs/promises'
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
      if (route === 'danisanlar') await page.getByRole('heading', { name: 'Danışanlar', exact: true }).waitFor()
      if (route === 'planlar') await page.getByRole('heading', { name: 'Planlar', exact: true }).waitFor()
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
      assert.equal(layout.sidebarDisplay, 'block')
      assert.ok(Math.abs(layout.sidebarWidth - 84) < 2, `navigation rail width was ${layout.sidebarWidth}`)
      assert.ok(layout.mainLeft >= layout.sidebarRight, `main ${layout.mainLeft} overlaps sidebar ${layout.sidebarRight}`)
      assert.equal(layout.navigationDirection, 'column')
      assert.equal(layout.navigationItemsDirection, 'column')
      if (route === 'panel') {
        assert.equal(layout.panelGridDisplay, 'grid'); assert.ok(layout.panelGridColumns >= 2)
        for (const width of [1440, 1920]) {
          await page.setViewportSize({ width, height: 960 })
          const upcoming = await page.locator('[data-panel-upcoming]').boundingBox()
          const quickStart = await page.locator('[data-panel-quickstart]').boundingBox()
          assert.ok(upcoming && quickStart)
          assert.ok(Math.abs(upcoming.y - quickStart.y) <= 1, `panel top edges differ at ${width}px: ${upcoming.y} / ${quickStart.y}`)
          assert.ok(quickStart.x >= upcoming.x + upcoming.width)
          assert.ok(upcoming.width > quickStart.width)
        }
        await page.setViewportSize({ width: 768, height: 960 })
        const upcoming = await page.locator('[data-panel-upcoming]').boundingBox()
        const quickStart = await page.locator('[data-panel-quickstart]').boundingBox()
        assert.ok(quickStart.y >= upcoming.y + upcoming.height, 'tablet cards should stack naturally')
        await page.setViewportSize({ width: 1440, height: 960 })
      }
      await page.screenshot({ path: join(dist, `layout-smoke-${route}.png`), fullPage: true })
    }
  } finally {
    await browser?.close(); await new Promise((done) => server.close(done))
  }
})

test('clinical workspace: responsive themes, navigation, forms and client operations', async () => {
  const { server, port } = await startServer()
  const artifacts = resolve(import.meta.dirname, '../../../artifacts/ui')
  await mkdir(artifacts, { recursive: true })
  let browser
  try {
    for (const executablePath of chromiumPath()) {
      try { browser = await chromium.launch({ executablePath, headless: true }); break } catch { /* Try installed browser. */ }
    }
    assert.ok(browser, 'No installed Chromium browser')
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    const url = `http://127.0.0.1:${port}/?layout-smoke=danisanlar`
    async function openList(native, dark) {
      await page.goto(url, { waitUntil: 'networkidle' })
      await page.evaluate(({ native, dark }) => {
        // Next supplies Inter via next/font; the isolated Vite fixture uses its
        // documented system fallback when rendering the web shell.
        document.documentElement.style.setProperty('--font-sans', 'Inter, ui-sans-serif, system-ui, "Segoe UI", sans-serif')
        document.documentElement.classList.toggle('dark', dark)
        if (!native) delete document.documentElement.dataset.nativeShell
      }, { native, dark })
      await page.locator('.clients-workspace a[href="/danisanlar/client-1"]').filter({ hasText: 'Deniz Yılmaz', visible: true }).waitFor()
    }
    async function noOverflow(label) {
      const sizes = await page.evaluate(() => {
        const main = document.querySelector('[data-app-main]')
        return { document: document.documentElement.scrollWidth, viewport: innerWidth, main: main.clientWidth, content: main.scrollWidth }
      })
      assert.ok(sizes.document <= sizes.viewport + 1, `${label}: document overflow ${JSON.stringify(sizes)}`)
      assert.ok(sizes.content <= sizes.main + 1, `${label}: workspace overflow ${JSON.stringify(sizes)}`)
    }
    async function checkContrast() {
      const ratios = await page.evaluate(() => {
        const shell = document.querySelector('[data-app-shell]')
        const probe = document.createElement('span')
        shell.append(probe)
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 1
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        function luminance(color) {
          probe.style.color = color
          ctx.clearRect(0, 0, 1, 1)
          ctx.fillStyle = getComputedStyle(probe).color
          ctx.fillRect(0, 0, 1, 1)
          const rgb = [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3).map((channel) => {
            const value = channel / 255
            return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
          })
          return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722
        }
        function ratio(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
        const result = {
          body: ratio('var(--foreground)', 'var(--card)'),
          secondary: ratio('var(--muted-foreground)', 'var(--card)'),
          action: ratio('var(--primary-foreground)', 'var(--primary)'),
          input: ratio(getComputedStyle(document.querySelector('input')).borderTopColor, 'var(--card)'),
        }
        probe.remove()
        return result
      })
      for (const key of ['body', 'secondary', 'action']) assert.ok(ratios[key] >= 4.5, `${key} contrast ${ratios[key]}`)
      assert.ok(ratios.input >= 3, `input boundary contrast ${ratios.input}`)
    }
    for (const native of [false, true]) {
      for (const dark of [false, true]) {
        for (const width of [1440, 900, 390]) {
          await page.setViewportSize({ width, height: 960 })
          await openList(native, dark)
          const label = `${native ? 'desktop' : 'web'}-${dark ? 'dark' : 'light'}-${width}`
          await noOverflow(label)
          await checkContrast()
          await page.screenshot({ path: join(artifacts, `clients-${label}.png`) })
          if (width === 1440) {
            const flyout = page.locator('[data-navigation-flyout]')
            const panelSurface = page.locator('.sidebar-panel-action')
            const menuSurface = page.locator('.sidebar-navigation-stack')
            const collapsedNavigation = await flyout.boundingBox()
            assert.ok(Math.abs(collapsedNavigation.width - 64) < 1)
            assert.ok(collapsedNavigation.height < 500, 'navigation should end after its items')
            assert.ok(Math.abs((await panelSurface.boundingBox()).width - 64) < 1)
            assert.ok(Math.abs((await menuSurface.boundingBox()).width - 64) < 1)
            await panelSurface.hover()
            await page.waitForFunction(() => document.querySelector('.sidebar-panel-action').getBoundingClientRect().width > 239)
            assert.ok(Math.abs((await menuSurface.boundingBox()).width - 64) < 1, 'lower navigation must remain collapsed while the panel action is open')
            await page.mouse.move(600, 400)
            await page.waitForFunction(() => document.querySelector('.sidebar-panel-action').getBoundingClientRect().width < 64.5)
            assert.equal(await page.locator('[data-sidebar-navigation] a[aria-current="page"]').getAttribute('href'), '/danisanlar')
            const activeLink = page.locator('[data-sidebar-navigation] a[aria-current="page"]')
            const activeIcon = activeLink.locator('.sidebar-link-icon')
            const colorPixels = (node) => {
              const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1
              const context = canvas.getContext('2d'); context.fillStyle = getComputedStyle(node).color; context.fillRect(0, 0, 1, 1)
              return [...context.getImageData(0, 0, 1, 1).data]
            }
            const colorBeforeHover = await activeIcon.evaluate(colorPixels)
            const menuHeightBeforeHover = (await menuSurface.boundingBox()).height
            await activeLink.hover()
            await page.getByText('Son danışanlar', { exact: true }).waitFor()
            assert.equal(await page.locator('[data-sidebar-navigation] a[href="/danisanlar/client-2"]').getAttribute('href'), '/danisanlar/client-2')
            await page.waitForFunction(() => document.querySelector('.sidebar-navigation-stack').getBoundingClientRect().width > 239)
            await page.waitForFunction(() => parseFloat(getComputedStyle(document.querySelector('.sidebar-navigation-stack .sidebar-label')).opacity) > 0.99)
            assert.deepEqual(await activeIcon.evaluate(colorPixels), colorBeforeHover, 'active navigation icon color must remain stable on hover')
            assert.ok(Math.abs((await menuSurface.boundingBox()).width - 240) < 1)
            assert.ok(Math.abs((await panelSurface.boundingBox()).width - 64) < 1, 'panel action must remain circular while the lower navigation is open')
            assert.ok(Math.abs((await menuSurface.boundingBox()).height - menuHeightBeforeHover) < 1, 'quick clients must not shift the navigation vertically')
            await page.screenshot({ path: join(artifacts, `navigation-expanded-${label}.png`) })
            await activeLink.click(); await page.mouse.move(600, 400)
            await page.waitForFunction(() => document.querySelector('.sidebar-navigation-stack').getBoundingClientRect().width < 64.5)
            await page.keyboard.press('Tab')
            await page.waitForFunction(() => document.querySelector('.sidebar-navigation-stack').getBoundingClientRect().width > 239)
            assert.ok(Math.abs((await menuSurface.boundingBox()).width - 240) < 1, 'keyboard focus keeps navigation open')
            await page.screenshot({ path: join(artifacts, `navigation-focus-${label}.png`) })
            await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur() })
            await page.mouse.move(600, 400)
            await page.waitForFunction(() => document.querySelector('.sidebar-navigation-stack').getBoundingClientRect().width < 64.5)
            await page.waitForFunction(() => parseFloat(getComputedStyle(document.querySelector('.sidebar-navigation-stack .sidebar-label')).opacity) < 0.01)
            await page.screenshot({ path: join(artifacts, `navigation-collapsed-${label}.png`) })
          }
          await page.locator('.clients-workspace a[href="/danisanlar/client-1"]').filter({ hasText: 'Deniz Yılmaz', visible: true }).click()
          await page.getByRole('heading', { name: 'Deniz Yılmaz' }).waitFor()
          assert.equal(await page.getByRole('tab').count(), 8)
          await noOverflow(`profile ${label}`)
          await page.screenshot({ path: join(artifacts, `profile-${label}.png`) })
          await page.getByRole('tab', { name: 'Genel', exact: true }).focus()
          await page.keyboard.press('ArrowRight')
          await page.getByText('Yeni ölçüm', { exact: true }).waitFor()
          assert.equal(await page.getByRole('tab', { name: 'Ölçümler', exact: true }).getAttribute('aria-selected'), 'true')
          await noOverflow(`measurements ${label}`)
          if (width === 1440) await page.screenshot({ path: join(artifacts, `measurements-${label}.png`) })
          await page.getByRole('tab', { name: 'Planlar', exact: true }).click()
          await page.getByText('Dengeli beslenme programı', { exact: true }).waitFor()
          await noOverflow(`plans ${label}`)
        }
      }
    }

    await page.setViewportSize({ width: 1440, height: 960 })
    await openList(false, false)
    // Extreme clinic accents still use readable paired foregrounds. The
    // production branding helper has independent unit coverage.
    for (const [brand, foreground] of [['#ffcc00', '#000000'], ['#243b80', '#ffffff']]) {
      await page.evaluate(({ brand, foreground }) => {
        const style = document.querySelector('[data-app-shell]').style
        for (const name of ['--primary', '--sidebar-primary']) style.setProperty(name, brand)
        for (const name of ['--primary-foreground', '--sidebar-primary-foreground']) style.setProperty(name, foreground)
      }, { brand, foreground })
      await checkContrast()
    }
    await openList(false, false)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    assert.ok(await page.locator('[data-sidebar-navigation] a').first().evaluate((node) => parseFloat(getComputedStyle(node).transitionDuration) <= 0.001))
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.getByRole('textbox', { name: 'Danışan ara' }).fill('bulunmayan')
    await page.getByRole('button', { name: 'Ara', exact: true }).click()
    await page.getByText('Bu filtrelerle danışan bulunamadı', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Filtreleri temizle', exact: true }).first().click()
    await page.locator('.clients-workspace a[href="/danisanlar/client-1"]').filter({ hasText: 'Deniz Yılmaz', visible: true }).waitFor()
    await page.getByRole('checkbox', { name: 'Deniz Yılmaz adlı danışanı seç' }).filter({ visible: true }).check()
    await page.getByRole('button', { name: 'Diyetisyen ata', exact: true }).click()
    await page.getByRole('combobox', { name: 'Atanacak diyetisyen' }).click()
    await page.getByRole('option', { name: 'Dyt. Ece Kaya' }).click()
    await page.getByRole('button', { name: 'Ata', exact: true }).click()
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    await page.getByRole('checkbox', { name: 'Deniz Yılmaz adlı danışanı seç' }).filter({ visible: true }).check()
    await page.getByRole('button', { name: 'Arşivle', exact: true }).click()
    await page.getByRole('row').filter({ hasText: 'Deniz Yılmaz' }).getByText('Arşiv', { exact: true }).waitFor()
    await page.getByRole('link', { name: 'Yeni danışan', exact: true }).click()
    await page.getByRole('button', { name: 'Danışanı kaydet' }).click()
    assert.equal(await page.locator('#firstName').getAttribute('aria-invalid'), 'true')
    await page.getByLabel('Ad', { exact: true }).fill('Test')
    await page.getByLabel('Soyad', { exact: true }).fill('Danışan')
    await page.getByRole('checkbox').nth(0).check()
    await page.getByRole('checkbox').nth(1).check()
    await page.getByRole('button', { name: 'Danışanı kaydet' }).click()
    await page.getByRole('heading', { name: 'Test Danışan' }).waitFor()

    await page.goto(`${url}&fixture-error=1`, { waitUntil: 'networkidle' })
    await page.getByRole('alert').getByText('Danışan kayıtları yüklenemedi.').waitFor()
    await page.getByRole('button', { name: 'Tekrar dene' }).click()
    await page.getByRole('alert').waitFor()
    for (const role of ['assistant', 'dietitian', 'owner']) {
      await page.goto(`${url}&role=${role}`, { waitUntil: 'networkidle' })
      const nav = page.locator('[data-sidebar-navigation]')
      assert.equal(await nav.locator('a[href="/finans"]').count(), role === 'owner' ? 1 : 0)
      assert.equal(await nav.locator('a[href="/ayarlar"]').count(), role === 'assistant' ? 0 : 1)
      if (role === 'assistant') assert.equal(await page.locator('input[type="checkbox"]').count(), 0)
    }
    await page.setViewportSize({ width: 390, height: 844 })
    await openList(false, false)
    await page.getByRole('button', { name: 'Diğer sayfalar' }).click()
    await page.getByRole('menuitem', { name: 'Ayarlar', exact: true }).waitFor()
    assert.equal(await page.getByRole('menuitem', { name: 'Finans', exact: true }).getAttribute('href'), '/finans')
    await page.keyboard.press('Escape')
    assert.deepEqual(errors, [], 'no browser runtime errors')
  } finally {
    await browser?.close()
    await new Promise((done) => server.close(done))
  }
})

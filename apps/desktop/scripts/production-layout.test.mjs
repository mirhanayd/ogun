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
  } finally {
    await browser?.close(); await new Promise((done) => server.close(done))
  }
})

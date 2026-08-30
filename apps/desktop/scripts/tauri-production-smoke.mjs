import { chromium } from 'playwright-core'
import { resolve } from 'node:path'

const endpoint = process.env.OGUN_TAURI_CDP ?? 'http://127.0.0.1:9333'
const browser = await chromium.connectOverCDP(endpoint)
const context = browser.contexts()[0]
const page = context?.pages()[0]
if (!page) throw new Error(`No Tauri WebView page at ${endpoint}`)

await page.waitForLoadState('domcontentloaded')
const login = await page.evaluate(() => ({
  url: location.href,
  title: document.title,
  text: document.body.innerText.slice(0, 300),
  font: getComputedStyle(document.body).fontFamily,
  titlebar: getComputedStyle(document.querySelector('[data-desktop-titlebar]')).display,
  stylesheets: document.styleSheets.length,
}))
await page.screenshot({ path: resolve('dist/tauri-production-login.png') })

const liveRoutes = []
if (await page.locator('[data-app-shell]').count()) {
  for (const route of ['danisanlar', 'planlar']) {
    await page.locator(`[data-sidebar-navigation-items] a[href="/${route}"]`).click()
    await page.getByRole('heading', { name: route === 'danisanlar' ? 'Danışanlar' : 'Planlar', exact: true }).waitFor()
    liveRoutes.push({ route, heading: await page.getByRole('heading', { name: route === 'danisanlar' ? 'Danışanlar' : 'Planlar', exact: true }).innerText() })
    await page.screenshot({ path: resolve(`dist/tauri-production-live-${route}.png`) })
  }
}

const routes = []
for (const route of ['panel', 'danisanlar', 'planlar']) {
  await page.goto(`http://tauri.localhost/?layout-smoke=${route}`)
  await page.locator('[data-app-shell]').waitFor()
  routes.push(await page.evaluate(() => {
    const sidebar = document.querySelector('[data-app-sidebar]').getBoundingClientRect()
    const main = document.querySelector('[data-app-main]').getBoundingClientRect()
    return {
      route: location.search,
      sidebarWidth: sidebar.width,
      sidebarDisplay: getComputedStyle(document.querySelector('[data-app-sidebar]')).display,
      mainLeft: main.left,
      sidebarRight: sidebar.right,
      navigationDirection: getComputedStyle(document.querySelector('[data-sidebar-navigation-items]')).flexDirection,
      shellDisplay: getComputedStyle(document.querySelector('[data-app-shell]')).display,
    }
  }))
  await page.screenshot({ path: resolve(`dist/tauri-production-${route}.png`) })
}
await page.goto('http://tauri.localhost/')
await context.setOffline(true)
await page.reload()
await page.getByText('Bu cihazdaki hesaplar').waitFor()
const accountButton = page.locator('section').filter({ hasText: 'Bu cihazdaki hesaplar' }).locator('button').first()
await accountButton.click()
await page.locator('input[type="password"][inputmode="numeric"]').waitFor()
const offlinePin = { title: await page.getByText('Bu cihazdaki hesaplar').innerText(), pinVisible: await page.locator('input[type="password"][inputmode="numeric"]').isVisible() }
await page.screenshot({ path: resolve('dist/tauri-production-offline-pin.png') })
await context.setOffline(false)
console.log(JSON.stringify({ login, liveRoutes, routes, offlinePin }, null, 2))
await browser.close()

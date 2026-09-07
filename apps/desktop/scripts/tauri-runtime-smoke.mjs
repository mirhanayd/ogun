import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { spawn, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from 'playwright-core'

// Real embedded renderer, Better Auth, native encrypted SQLite and local DB.
// Never use layout-smoke routes or replace repository/search callbacks.
const desktop = resolve(import.meta.dirname, '..')
const output = resolve(desktop, 'src-tauri/target/release-smoke')
const fixture = JSON.parse(await readFile(resolve(output, 'fixture.json'), 'utf8'))
const owner = fixture.people.find((person) => person.role === 'owner')
const executable = resolve(desktop, 'src-tauri/target/release/ogun-desktop.exe')
const backend = process.env.OGUN_SMOKE_BACKEND ?? 'http://localhost:3100'
assert.ok(['localhost', '127.0.0.1'].includes(new URL(backend).hostname))
const endpoint = 'http://127.0.0.1:9333'
const pin = '864209'
const screenshots = [], checks = []
let child, browser, context, page, priorToken
let provisioned = false, offline = false
const scope = { userId: owner.id, clinicId: fixture.clinic.id, role: 'owner', capabilities: ['*'] }
const powershell = (script) => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from("[Console]::OutputEncoding = New-Object Text.UTF8Encoding; $ProgressPreference='SilentlyContinue'; " + script, 'utf16le').toString('base64')], { windowsHide: true, encoding: 'utf8' }).trim()
const runKey = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
const startup = powershell(`$item=Get-ItemProperty -LiteralPath '${runKey}' -ErrorAction SilentlyContinue; ConvertTo-Json -Compress -InputObject $item.'Öğün'`)
const executableVersion = powershell(`(Get-Item -LiteralPath '${executable.replaceAll("'", "''")}').VersionInfo.ProductVersion`)
assert.equal(executableVersion, JSON.parse(await readFile(resolve(desktop, 'package.json'), 'utf8')).version)
const executableSha256 = createHash('sha256').update(await readFile(executable)).digest('hex')
await mkdir(output, { recursive: true })
await writeFile(resolve(output, 'startup-before-smoke.json'), startup)
async function until(action, label, timeout = 45000) {
  const deadline = Date.now() + timeout
  let last
  while (Date.now() < deadline) {
    try { const result = await action(); if (result) return result } catch (error) { last = error }
    await delay(300)
  }
  throw new Error(`${label}: ${last?.message ?? 'timed out'}`)
}
const invoke = (command, args = {}) => page.evaluate(({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args), { command, args })
const local = async (entityType) => (await invoke('list_local_entities', { scope, entityType })).map((row) => row.payload)
const outbox = () => invoke('load_local_outbox', { scope, limit: 500 })
async function start() {
  child = spawn(executable, [], { windowsHide: true, stdio: 'ignore', env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9333' } })
  await until(async () => (await fetch(`${endpoint}/json/version`)).ok, 'packaged CDP')
  browser = await chromium.connectOverCDP(endpoint)
  context = browser.contexts()[0]
  page = await until(() => context.pages()[0], 'Tauri page')
  page.setDefaultTimeout(20000)
  await context.route('https://ogun-web.vercel.app/**', async (route) => {
    if (offline) return route.abort('internetdisconnected')
    const url = new URL(route.request().url())
    const response = await route.fetch({ url: `${backend}${url.pathname}${url.search}`, timeout: 60000 })
    await route.fulfill({ response, headers: { ...response.headers(), 'access-control-allow-origin': 'http://tauri.localhost', 'access-control-allow-credentials': 'true', 'access-control-expose-headers': 'set-auth-token' } })
  })
  await page.waitForURL('http://tauri.localhost/**', { waitUntil: 'domcontentloaded' })
  assert.equal(new URL(page.url()).hostname, 'tauri.localhost')
  await page.locator('[data-desktop-login-form]').waitFor()
  if (offline) await setOffline(true)
}
async function stop() {
  await browser?.close().catch(() => {})
  if (child && child.exitCode === null) {
    child.kill()
    await until(() => child.exitCode !== null || child.signalCode !== null, 'process exit', 10000)
  }
  browser = null
  await delay(700)
}
async function setOffline(value) {
  offline = value
  const connected = value ? null : page.waitForResponse((response) => response.url().endsWith('/api/connectivity') && response.status() === 200)
  await context.setOffline(value)
  await page.evaluate((value) => window.dispatchEvent(new Event(value ? 'offline' : 'online')), value)
  if (connected) {
    await connected
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))
  }
}
async function capture(order, name) {
  const path = resolve(output, `${String(order).padStart(2, '0')}-${name}.png`)
  const mask = page.locator('[data-saved-accounts] button').filter({ hasNotText: owner.name }).filter({ has: page.locator('span.block.truncate') })
  await page.screenshot({ path, mask: [mask] })
  screenshots.push(path)
  console.log(`Captured ${order}: ${name}`)
}
async function pinLogin() {
  await page.locator('[data-saved-accounts]').getByRole('button').filter({ hasText: owner.name }).click()
  await page.getByPlaceholder('Hızlı giriş PIN’i').fill(pin)
  await page.getByRole('button', { name: 'PIN ile hızlı giriş', exact: true }).click()
  await page.locator('[data-app-shell]').waitFor()
}
const navigate = (name) => page.locator('[data-app-sidebar]').getByRole('link', { name, exact: true }).click()
async function anamnesis() {
  await navigate('Danışanlar')
  await page.getByText('Sürüm Doğrulama', { exact: true }).first().click()
  await page.getByRole('tab', { name: 'Anamnez', exact: true }).click()
  await page.getByRole('list', { name: 'Seçili hastalıklar' }).waitFor()
}
async function cloudWorkspace() {
  const token = await invoke('load_session_token')
  const response = await context.request.get(`${backend}/api/desktop/workspace`, { headers: { Authorization: `Bearer ${token}` } })
  assert.equal(response.status(), 200)
  return response.json()
}
try {
  await start()
  console.log('Packaged login ready')
  priorToken = await invoke('load_session_token')
  const profiles = await invoke('list_offline_profiles')
  assert.ok(!profiles.some((profile) => profile.userId === owner.id), 'Generate a fresh fixture')
  assert.equal(await page.getByLabel('E-posta', { exact: true }).count(), 1)
  assert.equal(await page.getByLabel('Şifre', { exact: true }).count(), 1)
  checks.push(`Unified login visible with ${profiles.length} existing profiles; no silent token login`)
  await setOffline(true)
  await page.getByRole('button', { name: 'Giriş yap', exact: true }).click()
  const message = profiles.filter((p) => p.pinConfigured).length
    ? 'İnternet bağlantısı yok. Bu cihazda daha önce kullandığınız kayıtlı bir hesap varsa PIN ile giriş yapabilirsiniz.'
    : 'Bu cihazda kayıtlı hesap bulunmuyor. İlk giriş için internet bağlantısı gereklidir.'
  await page.getByText(message, { exact: true }).waitFor()
  assert.ok(await page.locator('[data-desktop-login-form]').isVisible())
  await setOffline(false)
  await page.getByLabel('E-posta', { exact: true }).fill(owner.email)
  await page.getByLabel('Şifre', { exact: true }).fill(fixture.password)
  await page.getByRole('button', { name: 'Giriş yap', exact: true }).click()
  await page.locator('#desktop-pin').waitFor()
  provisioned = true
  await page.locator('#desktop-pin').fill(pin)
  await page.locator('#desktop-pin-confirm').fill(pin)
  await page.getByRole('button', { name: 'PIN’i kaydet ve devam et' }).click()
  await page.locator('[data-app-shell]').waitFor()
  console.log('Online login and PIN setup passed')
  const catalogResponse = await context.request.get(`${backend}/api/clinical/index`)
  assert.equal(catalogResponse.status(), 200)
  const catalog = await catalogResponse.json()
  await until(async () => {
    const info = await invoke('local_clinical_catalog_info')
    return info.version === catalog.version && info.conditionCount === catalog.conditions.length && info.medicationProductCount === catalog.medicationProducts.length && info.medicationSubstanceCount === catalog.medicationSubstances.length
  }, 'full canonical SQLite catalog', 120000)
  checks.push('Better Auth → actual workspace → PIN setup → full canonical SQLite catalog')
  await stop()
  offline = true
  await start()
  assert.equal(await page.locator('[data-app-shell]').count(), 0)
  await assert.rejects(() => local('clinic'))
  await capture(1, 'login-email-password-saved-account')
  await page.getByRole('button', { name: 'Giriş yap', exact: true }).click()
  await page.getByText('İnternet bağlantısı yok. Bu cihazda daha önce kullandığınız kayıtlı bir hesap varsa PIN ile giriş yapabilirsiniz.', { exact: true }).waitFor()
  assert.ok(await page.locator('[data-saved-accounts]').evaluate((element) => element.contains(document.activeElement)))
  await capture(2, 'offline-login-notice')
  await assert.rejects(() => invoke('unlock_offline_profile', { userId: owner.id, pin: '000000' }))
  await pinLogin()
  checks.push('Process restart: repository locked, incorrect PIN rejected, valid PIN unlocks offline')
  await anamnesis()
  await page.getByRole('list', { name: 'Seçili hastalıklar' }).getByText(fixture.condition.name_tr, { exact: true }).waitFor()
  assert.equal(await page.locator('#conditions').inputValue(), '')
  await capture(3, 'anamnesis-canonical-condition')
  await page.getByRole('combobox', { name: 'Hastalık kataloğundan seçim yap' }).click()
  await page.locator('[data-slot="popover-content"] [data-slot="command-input"]').fill('diy')
  await page.locator('[data-slot="popover-content"] [cmdk-item]').first().waitFor()
  await capture(4, 'offline-disease-search')
  await page.keyboard.press('Escape')
  await page.getByRole('tab', { name: 'İlaçlar', exact: true }).click()
  await page.getByRole('list', { name: 'Seçili ilaçlar ve etkin maddeler' }).getByText(fixture.product.name, { exact: true }).waitFor()
  await page.getByRole('combobox', { name: 'İlaç kataloğundan seçim yap' }).click()
  const search = page.locator('[data-slot="popover-content"] [data-slot="command-input"]')
  await search.fill('parol')
  await page.locator('[data-slot="popover-content"] [cmdk-item]').first().waitFor()
  await capture(5, 'offline-medication-search')
  await search.fill('metfor')
  await page.locator('[data-slot="popover-content"]').getByText(fixture.substance.name_tr, { exact: true }).first().click()
  await page.keyboard.press('Escape')
  await until(async () => (await outbox()).some((mutation) => mutation.kind === 'anamnesis.upsert'), 'canonical autosave')
  await navigate('Ayarlar')
  const logo = page.getByRole('img', { name: 'Klinik logosu önizlemesi' })
  await logo.waitFor()
  assert.ok(await logo.evaluate((image) => image.complete && image.naturalWidth > 0))
  await capture(6, 'settings-clinic-logo')
  await page.locator('#clinic-primary-color').fill('#C05030')
  await page.getByRole('button', { name: 'Değişiklikleri kaydet', exact: true }).click()
  await until(async () => (await local('clinic'))[0].primaryColor === '#C05030', 'clinic save')
  const color = await page.locator('[data-clinic-branding]').evaluate((element) => getComputedStyle(element).getPropertyValue('--primary').trim())
  // Reset viewport offset after the real Save click scrolled the form into view.
  await page.evaluate(() => window.scrollTo(0, 0))
  await capture(7, 'settings-custom-brand-color')
  await stop()
  await start()
  await pinLogin()
  await navigate('Ayarlar')
  assert.equal(await page.locator('#clinic-primary-color').inputValue(), '#C05030')
  assert.equal(await page.locator('[data-clinic-branding]').evaluate((element) => getComputedStyle(element).getPropertyValue('--primary').trim()), color)
  assert.ok(await page.getByRole('img', { name: 'Klinik logosu önizlemesi' }).evaluate((image) => image.complete && image.naturalWidth > 0))
  await capture(8, 'restart-same-branding')
  await anamnesis()
  await page.getByRole('tab', { name: 'İlaçlar', exact: true }).click()
  await page.getByRole('list', { name: 'Seçili ilaçlar ve etkin maddeler' }).getByText(fixture.product.name, { exact: true }).waitFor()
  await page.getByRole('list', { name: 'Seçili ilaçlar ve etkin maddeler' }).getByText(fixture.substance.name_tr, { exact: true }).waitFor()
  assert.equal((await local('anamneses')).filter((row) => row.clientId === fixture.client.id).length, 1)
  checks.push('Offline indexed searches, canonical autosave, process restart preserves product/substance/logo/color')
  await navigate('Danışanlar')
  await page.getByText(/77,2 kg/).first().waitFor()
  await page.getByText(/Geldi/).first().waitFor()
  await page.getByText(fixture.people.find((person) => person.role === 'dietitian').name, { exact: true }).last().waitFor()
  await capture(9, 'clients-real-activity-dietitian')
  await page.getByRole('checkbox', { name: 'Sürüm Doğrulama adlı danışanı seç' }).click()
  await page.getByRole('button', { name: 'Diyetisyen ata', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.waitFor()
  await capture(10, 'owner-dietitian-assignment-dialog')
  await dialog.getByRole('combobox').click()
  await page.getByRole('option', { name: owner.name, exact: true }).click()
  await dialog.getByRole('button', { name: 'Ata', exact: true }).click()
  await until(async () => (await local('clients')).find((row) => row.id === fixture.client.id)?.assignedDietitianId === owner.id, 'owner assignment')
  const pending = await outbox()
  assert.ok(pending.some((mutation) => mutation.kind === 'client.assignDietitian'))
  await page.keyboard.press('Control+K')
  const panel = page.locator('[data-command-panel]:visible')
  await panel.waitFor()
  assert.equal(await page.locator('[role="dialog"]:visible').count(), 0)
  assert.equal(await page.locator('[data-command-panel]:visible').count(), 1)
  await page.locator('[data-command-surface]:visible input:focus').fill('Sürüm')
  await panel.getByText('Sürüm Doğrulama', { exact: true }).waitFor()
  const geometry = await panel.evaluate((element) => {
    const trigger = element.closest('[data-command-surface]').querySelector('[data-command-trigger]').getBoundingClientRect()
    const bounds = element.getBoundingClientRect()
    return { top: bounds.top, bottom: trigger.bottom, width: bounds.width, triggerWidth: trigger.width }
  })
  assert.ok(geometry.top >= geometry.bottom && Math.abs(geometry.width - geometry.triggerWidth) < 2)
  await capture(11, 'search-anchored-under-topbar')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await panel.waitFor({ state: 'hidden' })
  await page.keyboard.press('Control+K')
  await page.keyboard.press('Escape')
  await panel.waitFor({ state: 'hidden' })
  await page.keyboard.press('Control+K')
  await panel.waitFor()
  await page.locator('main').click({ position: { x: 15, y: 150 } })
  await panel.waitFor({ state: 'hidden' })
  checks.push('Real activity, offline assignment, one anchored keyboard search without dialog')
  await setOffline(false)
  await until(async () => (await outbox()).length === 0, 'outbox acknowledgement', 120000)
  const workspace = await cloudWorkspace()
  assert.equal(workspace.clinic.primaryColor.toLowerCase(), '#c05030')
  assert.equal(workspace.clinic.logoUrl, fixture.clinic.logoUrl)
  assert.equal(workspace.clients.find((row) => row.id === fixture.client.id).assignedDietitianId, owner.id)
  const record = workspace.anamneses.find((row) => row.clientId === fixture.client.id)
  assert.ok(record.medicationSelections.some((row) => row.medicationProductId === fixture.product.id))
  assert.ok(record.medicationSelections.some((row) => row.medicationSubstanceId === fixture.substance.id))
  assert.deepEqual(record.legacyMedications, [])
  const token = await invoke('load_session_token')
  const replay = await context.request.post(`${backend}/api/desktop/workspace`, { headers: { Authorization: `Bearer ${token}` }, data: { mutations: pending.map((mutation) => ({ id: mutation.mutationId, kind: mutation.kind, payload: mutation.payload, createdAt: mutation.createdAt })) } })
  assert.equal(replay.status(), 200)
  checks.push('Actual reconnect and duplicate receipt replay preserve selections, assignment, branding')
  await until(async () => (await local('clinic'))[0].primaryColor.toLowerCase() === '#c05030', 'canonical branding pull')
  const webBrowser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    const webContext = await webBrowser.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } })
    const webPage = await webContext.newPage()
    await webPage.goto(`${backend}/danisanlar/${fixture.client.id}`)
    const tour = webPage.getByRole('button', { name: 'Turu atla' })
    if (await tour.isVisible()) await tour.click()
    await webPage.getByRole('tab', { name: 'Anamnez', exact: true }).click()
    await webPage.getByRole('tab', { name: 'İlaçlar', exact: true }).click()
    await webPage.getByRole('list', { name: 'Seçili ilaçlar ve etkin maddeler' }).getByText(fixture.substance.name_tr, { exact: true }).waitFor()
    await webPage.getByRole('tab', { name: 'Sağlık geçmişi', exact: true }).click()
    const alternative = catalog.conditions.find((row) => row.id !== fixture.condition.id && row.sourceCode === 'DOID:9352')
    assert.ok(alternative)
    await webPage.getByRole('combobox', { name: 'Hastalık kataloğundan seçim yap' }).click()
    await webPage.locator('[data-slot="popover-content"] [data-slot="command-input"]').fill('tip 2 diy')
    await webPage.locator(`[data-slot="popover-content"] [cmdk-item][data-value="${alternative.id}"]`).click()
    await until(async () => (await cloudWorkspace()).anamneses.find((row) => row.clientId === fixture.client.id).conditionSelections.some((row) => row.conditionId === alternative.id), 'real web canonical autosave')
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await until(async () => (await local('anamneses')).find((row) => row.clientId === fixture.client.id).conditionSelections.some((row) => row.conditionId === alternative.id), 'web → native pull')
    await anamnesis()
    await page.getByRole('list', { name: 'Seçili hastalıklar' }).getByText(alternative.nameTr, { exact: true }).waitFor()
    checks.push('Actual web form reads offline medication, web autosave → native pull displays canonical condition')

    for (const person of fixture.people.filter((person) => person.role !== 'owner')) {
      const login = await context.request.post(`${backend}/api/auth/sign-in/email`, { headers: { Origin: backend }, data: { email: person.email, password: fixture.password } })
      assert.equal(login.status(), 200)
      const roleToken = login.headers()['set-auth-token']
      assert.ok(roleToken)
      const roleHeaders = { Authorization: `Bearer ${roleToken}` }
      const deniedId = crypto.randomUUID()
      const denied = await context.request.post(`${backend}/api/desktop/workspace`, { headers: roleHeaders, data: { mutations: [{ id: deniedId, kind: 'client.assignDietitian', payload: { clientIds: [fixture.client.id], dietitianId: person.id }, createdAt: new Date().toISOString() }] } })
      assert.equal((await denied.json()).failedMutationId, deniedId)
      if (person.role === 'dietitian') {
        const dietContext = await webBrowser.newContext({ extraHTTPHeaders: roleHeaders })
        const dietPage = await dietContext.newPage()
        await dietPage.goto(`${backend}/danisanlar/yeni`)
        const skip = dietPage.getByRole('button', { name: 'Turu atla' })
        await skip.waitFor({ state: 'visible' })
        await skip.click()
        await dietPage.getByLabel('Ad', { exact: true }).fill('WebAuto')
        await dietPage.getByLabel('Soyad', { exact: true }).fill('Assignment')
        await dietPage.getByText('KVKK aydınlatma metnini okudum').click()
        await dietPage.getByText('Özel nitelikli (sağlık) verimin işlenmesine').click()
        await dietPage.getByRole('button', { name: 'Kaydet', exact: true }).click()
        await dietPage.waitForURL(/\/danisanlar\/(?!yeni)[^/]+$/)
        const ownWorkspace = await context.request.get(`${backend}/api/desktop/workspace`, { headers: roleHeaders })
        const created = (await ownWorkspace.json()).clients.find((row) => row.firstName === 'WebAuto')
        assert.equal(created.assignedDietitianId, person.id)
        await dietContext.close()
      }
    }
    checks.push('Real server rejects dietitian/assistant manual assignment; actual web dietitian create auto-assigns self')
    await webContext.close()
  } catch (error) {
    for (const webContext of webBrowser.contexts()) {
      for (const webPage of webContext.pages()) {
        console.error('Web smoke state:', (await webPage.locator('body').innerText()).slice(-2500))
        await webPage.screenshot({ path: resolve(output, 'web-failure.png') })
      }
    }
    throw error
  } finally { await webBrowser.close() }
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ executable, executableVersion, executableSha256, testedAt: new Date().toISOString(), backend, checks, screenshots }, null, 2))
  console.log(JSON.stringify({ checks, screenshots }, null, 2))
} catch (error) {
  if (page && !page.isClosed()) {
    await page.screenshot({ path: resolve(output, 'failure.png'), fullPage: true, mask: [page.locator('[data-saved-accounts]')] }).catch(() => {})
    console.error(await page.evaluate(() => { const body = document.body.cloneNode(true); body.querySelectorAll('[data-saved-accounts]').forEach((element) => element.remove()); return body.textContent.slice(-2500) }).catch(() => ''))
  }
  throw error
} finally {
  if (page && !page.isClosed()) {
    if (provisioned) {
      await invoke('unlock_offline_profile', { userId: owner.id, pin }).catch(() => {})
      await invoke('remove_active_offline_profile').catch(() => {})
    }
    if (priorToken !== undefined) await invoke(priorToken ? 'store_session_token' : 'clear_session_token', priorToken ? { token: priorToken } : {}).catch(() => {})
  }
  await stop()
  // App provisioning manages its startup registration. Keep a read-only record
  // for the test operator; this harness never edits Windows startup registry.
}

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const htmlUrl = new URL('../splash/index.html', import.meta.url)
const scriptUrl = new URL('../splash/offline.js', import.meta.url)
const searchModuleUrl = new URL('../splash/offline-search.mjs', import.meta.url)

test('packaged desktop page loads the maintainable offline client', async () => {
  const html = await readFile(htmlUrl, 'utf8')
  assert.match(html, /<script type="module" src="offline\.js"><\/script>/)
  assert.match(html, /ogun-uygulama-ikonu\.svg/)
  assert.match(html, /Hızlı giriş PIN’i/)
  assert.match(html, /<button data-page="foods">/)
  assert.match(html, /<button data-page="finance">/)
  assert.match(html, /id="page-client-detail"/)
  assert.match(html, /class="desktop-pill">Desktop</)
  assert.match(html, /id="clinic-initials"/)
  assert.match(html, /class="offline-chip"/)
  assert.match(html, /<h1>Panel<\/h1>/)
  assert.match(html, /data-modal="anamnesis"/)
  assert.match(html, /data-modal="measurement"/)
  assert.match(html, /data-modal="labResult"/)
  assert.match(html, /data-modal="payment"/)
  assert.match(html, /id="page-plan-editor"/)
  assert.match(html, /id="offline-food-search"/)
})

test('offline startup keeps the standard shell behind the saved-account PIN lock', async () => {
  const html = await readFile(htmlUrl, 'utf8')
  const script = await readFile(scriptUrl, 'utf8')
  assert.match(html, /#boot \{[\s\S]*position: fixed;[\s\S]*backdrop-filter: blur/)
  assert.match(script, /function showLockedShell/)
  assert.ok(
    script.indexOf('showLockedShell()') <
      script.indexOf("invoke('get_unlocked_offline_workspace')"),
  )
  assert.match(script, /window\.addEventListener\('online'/)
  assert.match(script, /goOnline\(current \? '\/panel' : '\/giris'\)/)
})

test('offline plan editor searches the encrypted food catalog and journals one replace draft', async () => {
  const script = await readFile(scriptUrl, 'utf8')
  assert.match(script, /search_offline_food_catalog/)
  assert.match(script, /get_offline_food_entries/)
  assert.match(script, /save_offline_plan_draft/)
  assert.match(script, /id: `plan-draft-\$\{editingPlanId\}`/)
  assert.match(script, /kind: 'plan\.draft\.replace'/)
  assert.match(script, /skeleton/)
})

test('offline header search finds device records with Turkish-insensitive matching', async () => {
  const { buildOfflineSearchResults, normalizeOfflineSearchText } = await import(
    searchModuleUrl.href
  )
  const workspace = {
    clients: [
      {
        id: 'client-1',
        firstName: 'Işıl',
        lastName: 'Öztürk',
        phone: '0555 111 22 33',
        email: 'isil@example.com',
      },
    ],
    plans: [{ id: 'plan-1', clientId: 'client-1', name: 'Glütensiz plan', status: 'taslak' }],
    appointments: [
      {
        id: 'appointment-1',
        clientId: 'client-1',
        type: 'kontrol',
        startsAt: '2026-08-28T09:00:00.000Z',
      },
    ],
  }

  assert.equal(normalizeOfflineSearchText('ÖLÇÜM IŞIL'), 'olcum isil')
  assert.equal(buildOfflineSearchResults(workspace, 'isil')[0]?.recordId, 'client-1')
  assert.equal(buildOfflineSearchResults(workspace, 'glutensiz')[0]?.recordId, 'plan-1')
  assert.equal(buildOfflineSearchResults(workspace, 'kontrol')[0]?.recordId, 'appointment-1')
  assert.equal(buildOfflineSearchResults(workspace, 'ayar')[0]?.targetPage, 'settings')
  assert.deepEqual(
    buildOfflineSearchResults(workspace, '').map((result) => result.kind),
    ['page', 'page', 'page', 'page', 'page'],
  )
})

test('offline header search is keyboard accessible and avoids native titlebar drag', async () => {
  const html = await readFile(htmlUrl, 'utf8')
  const script = await readFile(scriptUrl, 'utf8')
  assert.match(html, /id="global-search-trigger"/)
  assert.match(html, /id="global-search-input"/)
  assert.match(script, /event\.target\.closest\('\.title-search'\)/)
  assert.match(script, /event\.key === 'ArrowDown'/)
  assert.match(script, /event\.key === 'Enter'/)
  assert.match(script, /event\.key === 'Escape'/)
  assert.match(script, /event\.ctrlKey \|\| event\.metaKey/)
})

test('offline workspace remains backward compatible and journals every clinical record', async () => {
  const script = await readFile(scriptUrl, 'utf8')
  assert.ok(
    script.indexOf('const online = await networkAvailable()') <
      script.indexOf("invoke('get_unlocked_offline_workspace')"),
    'network must be checked before deciding which workspace to show',
  )
  for (const collection of [
    'clients',
    'anamneses',
    'measurements',
    'goals',
    'labResults',
    'payments',
    'plans',
    'appointments',
  ]) {
    assert.match(script, new RegExp(`'${collection}'`))
  }
  for (const mutation of [
    'client.create',
    'client.update',
    'anamnesis.upsert',
    'measurement.create',
    'goal.create',
    'labResult.create',
    'payment.create',
    'plan.create',
    'appointment.create',
  ]) {
    assert.ok(script.includes(`persist('${mutation}'`), `${mutation} must be journaled`)
  }
  assert.ok(
    script.indexOf("invoke('queue_offline_mutation'") <
      script.indexOf("invoke('save_offline_workspace'"),
    'mutation journal must be durable before the workspace projection is saved',
  )
})

test('offline autostart reveals the window only after device profiles are ready', async () => {
  const script = await readFile(scriptUrl, 'utf8')
  assert.ok(
    script.indexOf("profiles = await invoke('list_offline_profiles')") <
      script.indexOf("invoke('complete_startup_launch')"),
    'hidden autostart window must wait until saved profiles are loaded',
  )
})

test('titlebar drag detects double-click manually instead of relying on DOM dblclick', async () => {
  // Native sürükleme (DragMove) modal döngüsü tarayıcının click/dblclick
  // zincirini yuttuğu için dblclick olayı güvenilir ulaşmaz; ikinci hızlı
  // basış mousedown içinde yakalanmalı. Geri dönüşte dblclick dinleyicisi
  // kalmasın — ilk sürükleme ile birlikte çift geçiş (toggle+untoggle)
  // riskini yeniden yaratır.
  const script = await readFile(scriptUrl, 'utf8')
  assert.match(script, /DOUBLE_CLICK_TIME_MS/)
  assert.match(script, /action: 'toggleMaximize'/)
  assert.doesNotMatch(script, /addEventListener\('dblclick'/)
})

test('offline shell derives the same clinic and user identity marks as the live shell', async () => {
  const script = await readFile(scriptUrl, 'utf8')
  assert.match(
    script,
    /\$\('clinic-initials'\)\.textContent = initials\(current\.profile\.clinicName\)/,
  )
  assert.match(
    script,
    /\$\('title-avatar'\)\.textContent = initials\(current\.profile\.displayName\)/,
  )
  assert.match(script, /\.toLocaleUpperCase\('tr-TR'\)/)
})

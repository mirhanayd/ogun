import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const htmlUrl = new URL('../splash/index.html', import.meta.url)
const scriptUrl = new URL('../splash/offline.js', import.meta.url)

test('packaged desktop page loads the maintainable offline client', async () => {
  const html = await readFile(htmlUrl, 'utf8')
  assert.match(html, /<script src="offline\.js"><\/script>/)
  assert.match(html, /ogun-uygulama-ikonu\.svg/)
  assert.match(html, /Hızlı giriş PIN’i/)
  assert.match(html, /<button disabled title="Tarifler için internet bağlantısı gerekir">/)
  assert.match(html, /<button disabled title="Finans ekranı için internet bağlantısı gerekir">/)
  assert.match(html, /id="page-client-detail"/)
  assert.match(html, /class="desktop-pill">Desktop</)
  assert.match(html, /id="clinic-initials"/)
  assert.match(html, /class="offline-chip"/)
  assert.match(html, /<h1>Panel<\/h1>/)
  assert.match(html, /data-modal="anamnesis"/)
  assert.match(html, /data-modal="measurement"/)
  assert.match(html, /data-modal="labResult"/)
  assert.match(html, /data-modal="payment"/)
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

import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../../../', import.meta.url)
const file = (path) => new URL(path, root)
const read = (path) => readFile(file(path), 'utf8')
const missing = async (path) =>
  access(file(path)).then(
    () => false,
    () => true,
  )

test('Scenario A — initial online login seeds SQLite before PIN and dashboard', async () => {
  const app = await read('apps/web/src/desktop/desktop-app.tsx')
  assert.ok(app.indexOf("invoke('initialize_local_scope'") < app.indexOf('replaceLocalWorkspace('))
  assert.ok(app.indexOf('replaceLocalWorkspace(') < app.indexOf('onAuthenticated(identity'))
  assert.match(app, /<PinSetup identity=\{identity\}/)
  assert.match(app, /<PanelScreen feed=\{localPanelFeed\(localRows, identity\.role\)\}/)
})

test('Scenario B — cold offline start unlocks the packaged shared UI and local domains', async () => {
  const [entry, app, repository] = await Promise.all([
    read('apps/desktop/ui/main.tsx'),
    read('apps/web/src/desktop/desktop-app.tsx'),
    read('apps/web/src/desktop/native-workspace-repository.ts'),
  ])
  assert.match(entry, /import \{ DesktopApp \} from '@\/desktop\/desktop-app'/)
  assert.match(app, /<DesktopSavedAccounts onUnlocked=/)
  assert.match(app, /LocalClientsAdapter/)
  assert.match(app, /<PlansScreen/)
  assert.match(app, /FoodCatalogScreen/)
  assert.match(repository, /list_local_entities/)
  assert.match(repository, /search_local_foods/)
})

test('Scenario C — losing connectivity cannot switch renderer, route, or page', async () => {
  const [sync, app] = await Promise.all([
    read('apps/web/src/desktop/sync-engine.tsx'),
    read('apps/web/src/desktop/desktop-app.tsx'),
  ])
  assert.match(sync, /addEventListener\('offline', handleOffline\)/)
  assert.doesNotMatch(sync + app, /\.navigate\(|location\.reload|location\.replace/)
  assert.equal(await missing('apps/desktop/splash/offline.js'), true)
  assert.equal(await missing('apps/desktop/src-tauri/src/online_preload.rs'), true)
})

test('Scenario D — mutation projection and durable outbox share one SQLite transaction', async () => {
  const [database, repository] = await Promise.all([
    read('apps/desktop/src-tauri/src/local_db.rs'),
    read('apps/web/src/desktop/native-workspace-repository.ts'),
  ])
  const body = database.slice(database.indexOf('pub async fn apply_local_mutation'))
  assert.ok(body.indexOf('.transaction()') < body.indexOf('INSERT INTO entities'))
  assert.ok(body.indexOf('INSERT INTO entities') < body.indexOf('INSERT INTO outbox'))
  assert.ok(body.indexOf('INSERT INTO outbox') < body.lastIndexOf('.commit()'))
  assert.ok(
    repository.indexOf("invoke('apply_local_mutation'") <
      repository.indexOf("detail: { source: 'mutation'"),
  )
})

test('Scenario E — reconnect wakes push/pull sync without navigation or reload', async () => {
  const sync = await read('apps/web/src/desktop/sync-engine.tsx')
  assert.match(sync, /addEventListener\('online', handleOnline\)/)
  assert.match(sync, /outbox\.map\(outboxToSyncMutation\)/)
  assert.match(sync, /replaceLocalWorkspace\(scope/)
  assert.doesNotMatch(sync, /navigate|reload|\/panel/)
})

test('Scenario F — restart-safe retry metadata is stored in SQLite', async () => {
  const database = await read('apps/desktop/src-tauri/src/local_db.rs')
  assert.match(database, /CREATE TABLE IF NOT EXISTS outbox/)
  assert.match(database, /attempt_count INTEGER NOT NULL DEFAULT 0/)
  assert.match(database, /next_attempt_at TEXT/)
  assert.match(database, /sync_status IN \('pending','failed'\)/)
  assert.match(database, /2 << MIN\(attempt_count,10\)/)
})

test('Scenario G — duplicate retries use a scoped server receipt', async () => {
  const [schema, query, route] = await Promise.all([
    read('packages/db/src/schema/desktop-sync.ts'),
    read('packages/db/src/queries/desktop-sync.ts'),
    read('apps/web/src/app/api/desktop/workspace/route.ts'),
  ])
  assert.match(
    schema,
    /primaryKey\(\{ columns: \[table\.clinicId, table\.userId, table\.mutationId\] \}\)/,
  )
  assert.match(query, /onConflictDoNothing\(\)/)
  assert.ok(
    route.indexOf('getDesktopMutationReceipt(') < route.indexOf('recordDesktopMutationReceipt('),
  )
})

test('Scenario H — local data is isolated by user, clinic, role and authorization', async () => {
  const [database, vault] = await Promise.all([
    read('apps/desktop/src-tauri/src/local_db.rs'),
    read('apps/desktop/src-tauri/src/offline_vault.rs'),
  ])
  assert.match(
    database,
    /"\{\}\\u\{1f\}\{\}\\u\{1f\}\{\}"[\s\S]*scope\.user_id, scope\.clinic_id, scope\.role/,
  )
  assert.match(database, /authorize_local_scope/)
  assert.match(
    vault,
    /record\.summary\.user_id == user_id[\s\S]*record\.summary\.clinic_id == clinic_id[\s\S]*record\.summary\.role == role/,
  )
})

test('Scenario I — explicit logout removes the unlocked profile and its local scope', async () => {
  const [vault, shell, app] = await Promise.all([
    read('apps/desktop/src-tauri/src/offline_vault.rs'),
    read('apps/web/src/lib/native-shell.ts'),
    read('apps/web/src/desktop/desktop-app.tsx'),
  ])
  assert.match(
    vault,
    /active_online_user_id[\s\S]*or_else\(\|\| runtime\.unlocked_user_id\.clone\(\)\)/,
  )
  assert.match(vault, /remove_scope_data\(&app, &user_id\)/)
  assert.ok(
    shell.indexOf("invoke('remove_active_offline_profile'") <
      shell.indexOf("invoke('clear_session_token'"),
  )
  assert.match(app, /clearNativeSessionToken\(\)/)
})

test('Scenario J — browser UI remains server-backed while desktop bundles shared sources', async () => {
  const [config, webLayout, tauri] = await Promise.all([
    read('apps/desktop/vite.config.mts'),
    read('apps/web/src/app/(app)/layout.tsx'),
    read('apps/desktop/src-tauri/tauri.conf.json'),
  ])
  assert.match(config, /'@': fileURLToPath\(new URL\('\.\.\/web\/src'/)
  assert.match(webLayout, /AppShell/)
  assert.equal(JSON.parse(tauri).build.frontendDist, '../dist')
  assert.doesNotMatch(tauri, /ogun-web\.vercel\.app/)
})

#!/usr/bin/env node
// GitHub issue #51 / Prompt 9.1, GÖREV 2 — "simge public/brand/
// ogun-uygulama-ikonu.svg'den Windows .ico ve macOS .icns'e dönüştürülerek
// üretilsin."
//
// `@tauri-apps/cli`'nin `tauri icon` alt komutu, tek bir yüksek çözünürlüklü
// kaynaktan (SVG veya PNG) TÜM platform simge biçimlerini (.ico, .icns,
// Windows/Linux için çeşitli boyutlarda .png) üretir — burada tekerleği
// yeniden icat ETMİYORUZ, sadece doğru kaynağı doğru hedefe işaret ediyoruz.
//
// Kaynak: apps/web/public/brand/ogun-uygulama-ikonu.svg (mevcut marka
// varlığı, bkz. "brand_logos" commit'i) — bu dosya YOKSA betik burada
// AÇIKÇA durur, sessizce varsayılan bir Tauri simgesi üretmez.
import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const desktopRoot = resolve(__dirname, '..')
const repoRoot = resolve(desktopRoot, '..', '..')

const source = resolve(repoRoot, 'apps/web/public/brand/ogun-uygulama-ikonu.svg')
const outDir = resolve(desktopRoot, 'src-tauri/icons')

if (!existsSync(source)) {
  console.error(
    `[generate-icons] Kaynak bulunamadı: ${source}\n` +
      '[generate-icons] apps/web/public/brand/ogun-uygulama-ikonu.svg bulunamadı — ' +
      'bu dosya olmadan simge üretilmez, varsayılan bir Tauri simgesine düşülmez.',
  )
  process.exit(1)
}

console.log(`[generate-icons] Kaynak: ${source}`)
console.log(`[generate-icons] Hedef: ${outDir}`)

const result = spawnSync('pnpm', ['exec', 'tauri', 'icon', source, '--output', outDir], {
  cwd: desktopRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

if (result.status !== 0) {
  console.error('[generate-icons] `tauri icon` başarısız oldu, yukarıdaki çıktıya bakın.')
  process.exit(result.status ?? 1)
}

console.log('[generate-icons] Tamamlandı.')

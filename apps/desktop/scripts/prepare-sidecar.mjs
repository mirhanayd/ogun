#!/usr/bin/env node
// GitHub issue #51 / Prompt 9.1, GÖREV 1 — üretim paketleme hazırlığı.
//
// `pnpm tauri build` ÖNCESİNDE çalışması gereken adım: apps/web'i
// `output: 'standalone'` (bkz. apps/web/next.config.ts, STANDALONE_BUILD=1)
// ile derler, çıktıyı src-tauri/resources/web-server/ altına kopyalar
// (apps/web/Dockerfile'daki runner aşamasıyla AYNI üç kopyalama — standalone
// + .next/static + public, bkz. oradaki yorum) ve Tauri'nin "sidecar"
// mekanizmasının beklediği adda (binaries/app-server-<hedef-üçlü>[.exe])
// bir Node çalıştırılabilir dosyası hazırlar.
//
// KAPSAM/DÜRÜSTLÜK NOTU (bkz. PR açıklaması ve sidecar.rs'in başındaki
// yorum): burada bu makinenin KENDİ Node ikili dosyası kopyalanıp yeniden
// adlandırılıyor — bu, spawn/port-poll/yönlendirme MEKANİZMASINI gerçekten
// test edilebilir kılmak için yeterli, ama NİHAİ dağıtım için doğru
// değil: imzalanmamış, platforma özgü resmi Node dağıtımı değil, boyut
// optimizasyonu (Node SEA / pkg ile tek dosyaya derleme) yapılmadı. Hangi
// stratejinin (resmi Node indirmesi vs. tek-dosya derleme) kullanılacağı
// issue #54'ün ("Paketleme, imzalama ve dağıtım") kapsamı.
//
// NOT: `next build --turbopack` bu (iç içe git worktree) sandbox'ta
// `@better-auth/core` çözümleme hatasıyla başarısız oluyor (bkz.
// docs/deployment.md "Bilinen sınırlamalar" — worktree'ye özgü, gerçek bir
// üretim ortamında sorun değil). Bu yüzden burada apps/web'in `build`
// script'i (`next build --turbopack`) DEĞİL, doğrudan `next build`
// (webpack, turbopack'siz) çağrılıyor — apps/web'in package.json'ı
// DEĞİŞMEDİ, sadece bu betik build'i nasıl tetiklediğini seçiyor.
import { existsSync, mkdirSync, rmSync, cpSync, copyFileSync, chmodSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const desktopRoot = resolve(__dirname, '..')
const repoRoot = resolve(desktopRoot, '..', '..')
const webRoot = resolve(repoRoot, 'apps/web')

function run(command, args, opts = {}) {
  console.log(`[prepare-sidecar] $ ${command} ${args.join(' ')}`)
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...opts,
  })
  if (result.status !== 0) {
    console.error(`[prepare-sidecar] Komut başarısız oldu (exit ${result.status}): ${command} ${args.join(' ')}`)
    process.exit(result.status ?? 1)
  }
}

function rustTargetTriple() {
  const result = spawnSync('rustc', ['-vV'], { encoding: 'utf8', shell: process.platform === 'win32' })
  if (result.status === 0) {
    const match = /host:\s*(\S+)/.exec(result.stdout)
    if (match) return match[1]
  }
  // rustc yoksa (Rust kurulu değilse) platforma göre makul bir varsayılana
  // düş — sadece `resources/binaries` hazırlığı için, gerçek derleme zaten
  // rustc gerektirir.
  const fallback = { win32: 'x86_64-pc-windows-msvc', darwin: 'aarch64-apple-darwin', linux: 'x86_64-unknown-linux-gnu' }
  console.warn(
    `[prepare-sidecar] rustc bulunamadı, hedef üçlü için platform varsayılanı kullanılıyor: ${fallback[process.platform]}`,
  )
  return fallback[process.platform] ?? 'x86_64-pc-windows-msvc'
}

// 1) apps/web'i standalone modda derle (turbopack'siz, bkz. yukarıdaki not).
console.log('[prepare-sidecar] apps/web STANDALONE_BUILD=1 ile derleniyor (next build, turbopack YOK)...')
run('pnpm', ['--filter', 'web', 'exec', 'next', 'build'], {
  cwd: repoRoot,
  env: { ...process.env, STANDALONE_BUILD: '1' },
})

const standaloneDir = resolve(webRoot, '.next/standalone')
if (!existsSync(standaloneDir)) {
  console.error(`[prepare-sidecar] Beklenen standalone çıktısı yok: ${standaloneDir}`)
  process.exit(1)
}

// 2) Çıktıyı src-tauri/resources/web-server/ altına kopyala — Dockerfile'ın
// runner aşamasıyla AYNI üç kopyalama (standalone + .next/static + public).
const resourcesDir = resolve(desktopRoot, 'src-tauri/resources/web-server')
console.log(`[prepare-sidecar] Kaynaklar kopyalanıyor -> ${resourcesDir}`)
rmSync(resourcesDir, { recursive: true, force: true })
mkdirSync(resourcesDir, { recursive: true })
cpSync(standaloneDir, resourcesDir, { recursive: true })
cpSync(resolve(webRoot, '.next/static'), resolve(resourcesDir, 'apps/web/.next/static'), { recursive: true })
cpSync(resolve(webRoot, 'public'), resolve(resourcesDir, 'apps/web/public'), { recursive: true })

// 3) Node sidecar ikili dosyasını hazırla: mevcut makinenin node
// çalıştırılabilirini Tauri'nin beklediği adla kopyala.
const target = rustTargetTriple()
const binariesDir = resolve(desktopRoot, 'src-tauri/binaries')
mkdirSync(binariesDir, { recursive: true })
const ext = process.platform === 'win32' ? '.exe' : ''
const sidecarPath = resolve(binariesDir, `app-server-${target}${ext}`)
console.log(`[prepare-sidecar] Node sidecar ikili dosyası kopyalanıyor -> ${sidecarPath}`)
copyFileSync(process.execPath, sidecarPath)
if (process.platform !== 'win32') {
  chmodSync(sidecarPath, 0o755)
}

console.log('[prepare-sidecar] Tamamlandı. `pnpm tauri build` şimdi çalıştırılabilir.')
console.log(
  `[prepare-sidecar] NOT: ${sidecarPath} bu makinenin Node çalıştırılabilir dosyasının bir KOPYASI — ` +
    'gerçek imzalı/optimize dağıtım paketlemesi issue #54 kapsamındadır (bkz. bu betiğin başındaki not).',
)

#!/usr/bin/env node
// GitHub issue #51 / Prompt 9.1, GÖREV 1 — üretim paketleme hazırlığı.
// GitHub issue #54 / Prompt 9.4, GÖREV 1 — GERÇEK, imzalı, platforma özgü
// Node dağıtımı seçimi (bkz. aşağıdaki "GÖREV 1" bölümü ve dosya sonu notu).
//
// `pnpm tauri build` ÖNCESİNDE çalışması gereken adım: apps/web'i
// `output: 'standalone'` (bkz. apps/web/next.config.ts, STANDALONE_BUILD=1)
// ile derler, çıktıyı src-tauri/resources/web-server/ altına kopyalar
// (apps/web/Dockerfile'daki runner aşamasıyla AYNI üç kopyalama — standalone
// + .next/static + public, bkz. oradaki yorum) ve Tauri'nin "sidecar"
// mekanizmasının beklediği adda (binaries/app-server-<hedef-üçlü>[.exe])
// bir Node çalıştırılabilir dosyası hazırlar.
//
// NOT: `next build --turbopack` bu (iç içe git worktree) sandbox'ta
// `@better-auth/core` çözümleme hatasıyla başarısız oluyor (bkz.
// docs/deployment.md "Bilinen sınırlamalar" — worktree'ye özgü, gerçek bir
// üretim ortamında sorun değil). Bu yüzden burada apps/web'in `build`
// script'i (`next build --turbopack`) DEĞİL, doğrudan `next build`
// (webpack, turbopack'siz) çağrılıyor — apps/web'in package.json'ı
// DEĞİŞMEDİ, sadece bu betik build'i nasıl tetiklediğini seçiyor.
//
// ---------------------------------------------------------------------
// GÖREV 1 (issue #54) — SİDECAR İKİLİ DOSYASI SEÇİMİ, İKİ MOD:
//
// 1) `host` (VARSAYILAN — yerel geliştirme/test, ör. `pnpm build`): ÖNCEKİ
//    davranışla AYNI — bu makinenin KENDİ Node çalıştırılabilirini kopyalar.
//    Hızlı, ağ GEREKTİRMEZ, spawn/port-poll/yönlendirme MEKANİZMASINI test
//    etmek için yeterli — ama NİHAİ dağıtım için doğru DEĞİL (imzasız,
//    platforma özgü resmi dağıtım DEĞİL).
// 2) `download` (RELEASE CI, bkz. .github/workflows/desktop-release.yml):
//    nodejs.org'un RESMİ, imzalı dağıtımını hedef üçlüye göre indirir,
//    SHASUMS256.txt'e karşı SHA-256 doğrular, gerekirse (tar.gz — macOS)
//    arşivden çıkarır. `universal-apple-darwin` hedefi İKİ mimariyi
//    (aarch64 + x86_64) AYRI AYRI indirip `lipo` ile TEK bir evrensel
//    ikiliye birleştirir (bkz. Tauri bundler kaynak kodu incelemesi, PR
//    açıklaması: "evrensel macOS derlemesi için harici ikili de evrensel
//    olmalı ve hedef üçlü '-universal-apple-darwin' son ekiyle adlandırılmalı"
//    — iki AYRI mimariye özgü isimlendirme DEĞİL).
//
// Mod seçimi `--source=download` CLI argümanı YA DA `OGUN_SIDECAR_SOURCE=
// download` ortam değişkeni ile yapılır (workflow ikincisini kullanır).
// Hedef üçlü `--target=<üçlü>` YA DA `OGUN_SIDECAR_TARGET` ile seçilir,
// belirtilmezse bu makinenin kendi üçlüsüne düşer (mevcut davranış).
//
// DÜRÜSTLÜK NOTU (bkz. PR açıklaması): indirme+SHA-256 doğrulama+arşiv
// çıkarma MEKANİZMASI bu PR'ın hazırlanması sırasında GERÇEKTEN, canlı
// nodejs.org'a karşı test edildi (win-x64/node.exe VE
// node-v24.19.0-darwin-arm64.tar.gz gerçekten indirildi, SHA-256'ları
// SHASUMS256.txt ile BİREBİR eşleşti, tar.gz GERÇEKTEN çıkarıldı ve
// içindeki `bin/node`'un GERÇEKTEN bir Mach-O arm64 çalıştırılabilir
// olduğu `file` ile doğrulandı — bkz. PR açıklaması). Doğrulanamayan TEK
// parça: `lipo` (macOS'a özgü bir araç, bu sandbox Windows olduğu için
// ÇALIŞTIRILAMADI) — evrensel macOS birleştirme adımı bu yüzden SADECE
// kaynak kodu okunarak (doğru `lipo -create -output ... a b` çağrısı)
// yazıldı, gerçek bir macOS'ta CANLI test EDİLEMEDİ.
import {
  existsSync,
  mkdirSync,
  rmSync,
  cpSync,
  copyFileSync,
  chmodSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const desktopRoot = resolve(__dirname, '..')
const repoRoot = resolve(desktopRoot, '..', '..')
const webRoot = resolve(repoRoot, 'apps/web')

// Sidecar için indirilecek Node sürümü — güncellemek için nodejs.org/en/
// download/releases'teki güncel bir LTS sürümüyle DEĞİŞTİRİN (SHASUMS256.txt
// otomatik olarak AYNI sürümden çekilir, elle güncellenecek başka bir yer
// YOK).
const NODE_VERSION = '24.19.0'

function run(command, args, opts = {}) {
  console.log(`[prepare-sidecar] $ ${command} ${args.join(' ')}`)
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...opts,
  })
  if (result.status !== 0) {
    console.error(
      `[prepare-sidecar] Komut başarısız oldu (exit ${result.status}): ${command} ${args.join(' ')}`,
    )
    process.exit(result.status ?? 1)
  }
}

function rustTargetTriple() {
  const result = spawnSync('rustc', ['-vV'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })
  if (result.status === 0) {
    const match = /host:\s*(\S+)/.exec(result.stdout)
    if (match) return match[1]
  }
  // rustc yoksa (Rust kurulu değilse) platforma göre makul bir varsayılana
  // düş — sadece `resources/binaries` hazırlığı için, gerçek derleme zaten
  // rustc gerektirir.
  const fallback = {
    win32: 'x86_64-pc-windows-msvc',
    darwin: 'aarch64-apple-darwin',
    linux: 'x86_64-unknown-linux-gnu',
  }
  console.warn(
    `[prepare-sidecar] rustc bulunamadı, hedef üçlü için platform varsayılanı kullanılıyor: ${fallback[process.platform]}`,
  )
  return fallback[process.platform] ?? 'x86_64-pc-windows-msvc'
}

// --- CLI/ortam değişkeni argüman ayrıştırma -------------------------------

function readArg(flag, envName) {
  const prefix = `--${flag}=`
  const fromArgv = process.argv.find((arg) => arg.startsWith(prefix))
  if (fromArgv) return fromArgv.slice(prefix.length)
  return process.env[envName] || undefined
}

const sidecarSource = readArg('source', 'OGUN_SIDECAR_SOURCE') || 'host'
const sidecarTarget = readArg('target', 'OGUN_SIDECAR_TARGET') || rustTargetTriple()

if (!['host', 'download'].includes(sidecarSource)) {
  console.error(
    `[prepare-sidecar] Bilinmeyen --source değeri: ${sidecarSource} (beklenen: host | download)`,
  )
  process.exit(1)
}

// --- 1) apps/web'i standalone modda derle ---------------------------------

// Next.js apps/web/.env.local'ı kök .env'den önce okur. Web ve desktop
// farklı DATABASE_URL/BETTER_AUTH_SECRET ile derlenirse aynı kullanıcı
// hesabı iki tarafta paylaşılamaz. Yerel .env varsa build'den hemen önce
// tek doğruluk kaynağını senkronla; CI'da dosya yoksa script no-op'tur.
run(process.execPath, [resolve(repoRoot, 'scripts/sync-web-env.mjs')], { cwd: repoRoot })

console.log(
  '[prepare-sidecar] apps/web STANDALONE_BUILD=1 ile derleniyor (next build, turbopack YOK)...',
)
run('pnpm', ['--filter', 'web', 'exec', 'next', 'build'], {
  cwd: repoRoot,
  env: { ...process.env, STANDALONE_BUILD: '1' },
})

const standaloneDir = resolve(webRoot, '.next/standalone')
if (!existsSync(standaloneDir)) {
  console.error(`[prepare-sidecar] Beklenen standalone çıktısı yok: ${standaloneDir}`)
  process.exit(1)
}

// --- 2) Çıktıyı src-tauri/resources/web-server/ altına kopyala -----------

const resourcesDir = resolve(desktopRoot, 'src-tauri/resources/web-server')
console.log(`[prepare-sidecar] Kaynaklar kopyalanıyor -> ${resourcesDir}`)
rmSync(resourcesDir, { recursive: true, force: true })
mkdirSync(resourcesDir, { recursive: true })
cpSync(standaloneDir, resourcesDir, { recursive: true })
cpSync(resolve(webRoot, '.next/static'), resolve(resourcesDir, 'apps/web/.next/static'), {
  recursive: true,
})
cpSync(resolve(webRoot, 'public'), resolve(resourcesDir, 'apps/web/public'), { recursive: true })

// --- 3) Node sidecar ikili dosyasını hazırla ------------------------------

const binariesDir = resolve(desktopRoot, 'src-tauri/binaries')
mkdirSync(binariesDir, { recursive: true })

// Rust target-triple -> nodejs.org dağıtım platformu/mimarisi eşlemesi.
// SADECE Windows + macOS (bkz. issue metni: "Linux şimdilik hedef DEĞİL").
const NODE_DIST_TARGETS = {
  'x86_64-pc-windows-msvc': { distPlatform: 'win', distArch: 'x64', archiveKind: 'exe' },
  'aarch64-pc-windows-msvc': { distPlatform: 'win', distArch: 'arm64', archiveKind: 'exe' },
  'x86_64-apple-darwin': { distPlatform: 'darwin', distArch: 'x64', archiveKind: 'tar.gz' },
  'aarch64-apple-darwin': { distPlatform: 'darwin', distArch: 'arm64', archiveKind: 'tar.gz' },
}

let shasumsCache = null
async function fetchExpectedSha256(fileName) {
  if (!shasumsCache) {
    const url = `https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt`
    console.log(`[prepare-sidecar] SHASUMS256.txt indiriliyor -> ${url}`)
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`SHASUMS256.txt indirilemedi: HTTP ${response.status}`)
    }
    shasumsCache = await response.text()
  }
  const line = shasumsCache.split('\n').find((l) => l.trim().endsWith(`  ${fileName}`))
  if (!line) {
    throw new Error(`SHASUMS256.txt içinde "${fileName}" için bir satır bulunamadı.`)
  }
  return line.trim().split(/\s+/)[0]
}

async function downloadToFile(url, destPath) {
  console.log(`[prepare-sidecar] indiriliyor -> ${url}`)
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`İndirme başarısız (HTTP ${response.status}): ${url}`)
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  writeFileSync(destPath, buffer)
  return buffer
}

function sha256Of(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

async function verifyChecksum(buffer, fileName) {
  const expected = await fetchExpectedSha256(fileName)
  const actual = sha256Of(buffer)
  if (actual !== expected) {
    throw new Error(`SHA-256 uyuşmazlığı — ${fileName}: beklenen ${expected}, hesaplanan ${actual}`)
  }
  console.log(`[prepare-sidecar] SHA-256 doğrulandı: ${fileName}`)
}

// Tek bir (universal OLMAYAN) Rust hedef üçlüsü için resmi Node ikilisini
// indirir, doğrular, gerekirse arşivden çıkarır ve `destPath`'e yazar.
async function downloadNodeBinaryForTriple(triple, destPath) {
  const distInfo = NODE_DIST_TARGETS[triple]
  if (!distInfo) {
    throw new Error(
      `"${triple}" için bilinen bir nodejs.org dağıtım eşlemesi yok (bkz. NODE_DIST_TARGETS — sadece Windows/` +
        `macOS hedefleri destekleniyor, issue #54'ün kapsamı gereği Linux DIŞARIDA).`,
    )
  }
  const { distPlatform, distArch, archiveKind } = distInfo

  if (archiveKind === 'exe') {
    // Windows: nodejs.org düz, ARŞİVSİZ bir .exe de yayınlıyor —
    // https://nodejs.org/dist/vX.Y.Z/win-<arch>/node.exe — extraction
    // GEREKMEZ.
    const fileName = 'node.exe'
    const shasumsKey = `${distPlatform}-${distArch}/node.exe`
    const url = `https://nodejs.org/dist/v${NODE_VERSION}/${distPlatform}-${distArch}/${fileName}`
    const buffer = await downloadToFile(url, destPath)
    await verifyChecksum(buffer, shasumsKey)
    return
  }

  // macOS: sadece bir tar.gz arşivi yayınlanıyor, içinden `bin/node`'u
  // çıkarmamız gerekiyor.
  const archiveName = `node-v${NODE_VERSION}-${distPlatform}-${distArch}.tar.gz`
  const url = `https://nodejs.org/dist/v${NODE_VERSION}/${archiveName}`
  const tempDir = join(tmpdir(), `ogun-node-${distArch}-${Date.now()}`)
  mkdirSync(tempDir, { recursive: true })
  const archivePath = join(tempDir, archiveName)
  const buffer = await downloadToFile(url, archivePath)
  await verifyChecksum(buffer, archiveName)

  const extractDir = join(dirname(archivePath), 'extracted')
  mkdirSync(extractDir, { recursive: true })
  // `--force-local`: hem GNU tar (Linux/CI) HEM DE Windows'un yerleşik
  // bsdtar'ı, `C:\...` gibi TEK harfli bir "sürücü" öneki taşıyan bir yolu
  // `-f` argümanı olarak verildiğinde `host:path` UZAK tar sözdizimi
  // SANIYOR ("tar (child): Cannot connect to C: resolve failed") — bu
  // GERÇEKTEN bu sandbox'ta (Windows) canlı gözlemlendi (bkz. PR açıklaması)
  // ve `--force-local` ile GERÇEKTEN düzeldi. macOS'ta (asıl bu kod yolunun
  // ÇALIŞACAĞI CI ortamı) yollar `/` ile başladığından bu durum zaten hiç
  // TETİKLENMEZ — bayrak orada zararsız/gereksiz ama YİNE DE eklendi (Windows
  // üzerinde `--source=download` ile yerel test/hata ayıklama senaryosu
  // için).
  run('tar', ['--force-local', '-xzf', archivePath, '-C', extractDir])

  const extractedBinary = join(
    extractDir,
    `node-v${NODE_VERSION}-${distPlatform}-${distArch}`,
    'bin',
    'node',
  )
  if (!existsSync(extractedBinary)) {
    throw new Error(`Arşivden beklenen ikili bulunamadı: ${extractedBinary}`)
  }
  copyFileSync(extractedBinary, destPath)
  chmodSync(destPath, 0o755)
  rmSync(dirname(archivePath), { recursive: true, force: true })
}

async function prepareUniversalMacosBinary(destPath) {
  // GÖREV 1 (issue #54) — Tauri bundler kaynak kodu incelemesi (bkz. PR
  // açıklaması): "evrensel bir macOS uygulaması paketliyorsanız, harici
  // ikilinizin de evrensel olması ve hedef üçlü ile adlandırılması
  // BEKLENİR, ör. `sqlite3-universal-apple-darwin`" — yani İKİ AYRI
  // mimariye özgü dosya YERİNE `lipo` ile birleştirilmiş TEK bir dosya.
  const arm64Path = join(tmpdir(), `app-server-aarch64-apple-darwin-${Date.now()}`)
  const x64Path = join(tmpdir(), `app-server-x86_64-apple-darwin-${Date.now()}`)
  await downloadNodeBinaryForTriple('aarch64-apple-darwin', arm64Path)
  await downloadNodeBinaryForTriple('x86_64-apple-darwin', x64Path)

  if (process.platform !== 'darwin') {
    // `lipo` SADECE macOS'ta var — bu betik burada net bir hata ile durur,
    // SESSİZCE yanlış bir ikili ÜRETMEZ. Release workflow'u macOS derlemesini
    // `macos-latest` runner'ında çalıştırmalı (bkz. .github/workflows/
    // desktop-release.yml) — Windows/Linux CI runner'ında universal macOS
    // sidecar HAZIRLANAMAZ.
    throw new Error(
      "'universal-apple-darwin' hedefi için Node ikilileri indirildi (aarch64 + x86_64) ama `lipo` ile " +
        "birleştirme SADECE macOS üzerinde yapılabilir. Bu adımı bir macOS CI runner'ında (ör. macos-latest) " +
        'çalıştırın.',
    )
  }

  run('lipo', ['-create', '-output', destPath, arm64Path, x64Path])
  chmodSync(destPath, 0o755)
  rmSync(arm64Path, { force: true })
  rmSync(x64Path, { force: true })
}

const sidecarExt = sidecarTarget.includes('windows') ? '.exe' : ''
const sidecarPath = resolve(binariesDir, `app-server-${sidecarTarget}${sidecarExt}`)

if (sidecarSource === 'host') {
  // Hızlı yerel yol — bu makinenin KENDİ Node çalıştırılabilirini kopyalar
  // (bkz. dosya başı "1) host" notu). `sidecarTarget` genelde bu makinenin
  // KENDİ üçlüsü olacağından bu, çoğu geliştirme senaryosunda `download`
  // moduyla AYNI dosya adını üretir — ama İÇERİĞİ farklıdır (imzasız/yerel
  // kopya vs. resmi indirilmiş dağıtım).
  console.log(
    `[prepare-sidecar] [host modu] Node sidecar ikili dosyası kopyalanıyor -> ${sidecarPath}`,
  )
  copyFileSync(process.execPath, sidecarPath)
  if (process.platform !== 'win32') {
    chmodSync(sidecarPath, 0o755)
  }
} else {
  console.log(
    `[prepare-sidecar] [download modu] hedef: ${sidecarTarget}, Node sürümü: v${NODE_VERSION}`,
  )
  if (sidecarTarget === 'universal-apple-darwin') {
    await prepareUniversalMacosBinary(sidecarPath)
  } else {
    await downloadNodeBinaryForTriple(sidecarTarget, sidecarPath)
  }
  console.log(`[prepare-sidecar] [download modu] tamamlandı -> ${sidecarPath}`)
}

console.log('[prepare-sidecar] Tamamlandı. `pnpm tauri build` şimdi çalıştırılabilir.')
if (sidecarSource === 'host') {
  console.log(
    `[prepare-sidecar] NOT: ${sidecarPath} bu makinenin Node çalıştırılabilir dosyasının bir KOPYASI — ` +
      'gerçek dağıtım için `--source=download` (bkz. .github/workflows/desktop-release.yml) kullanılmalı.',
  )
}

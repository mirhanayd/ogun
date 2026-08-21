#!/usr/bin/env node

import { copyFileSync, mkdirSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const desktopRoot = resolve(scriptDir, '..')
const tauriRoot = resolve(desktopRoot, 'src-tauri')

const rustc = spawnSync('rustc', ['-vV'], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
})

if (rustc.status !== 0) {
  console.error('[prepare-dev] rustc çalıştırılamadı. Rust toolchain kurulumunu kontrol edin.')
  process.exit(rustc.status ?? 1)
}

const target = /^host:\s*(\S+)$/m.exec(rustc.stdout)?.[1]
if (!target) {
  console.error('[prepare-dev] rustc çıktısından hedef üçlü belirlenemedi.')
  process.exit(1)
}

const binariesDir = resolve(tauriRoot, 'binaries')
const resourcesDir = resolve(tauriRoot, 'resources/web-server')
const extension = target.includes('windows') ? '.exe' : ''
const sidecarPath = resolve(binariesDir, `app-server-${target}${extension}`)

mkdirSync(binariesDir, { recursive: true })
mkdirSync(resourcesDir, { recursive: true })

let sidecarIsCurrent = false
try {
  sidecarIsCurrent = statSync(sidecarPath).size === statSync(process.execPath).size
} catch {
  // Missing generated sidecar is the normal first-run case.
}

if (!sidecarIsCurrent) {
  copyFileSync(process.execPath, sidecarPath)
  console.log(`[prepare-dev] Node sidecar hazırlandı: ${sidecarPath}`)
}

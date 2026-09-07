import { test } from '@playwright/test'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

test('packaged Tauri native release round trip', async () => {
  test.skip(process.env.OGUN_PACKAGED_SMOKE !== '1', 'Explicit packaged native smoke opt-in')
  test.setTimeout(360000)
  await new Promise<void>((done, reject) => {
    const child = spawn(process.execPath, [resolve(__dirname, '../../desktop/scripts/tauri-production-smoke.mjs')], { windowsHide: true, stdio: 'inherit', env: process.env })
    child.on('error', reject)
    child.on('exit', (code) => code === 0 ? done() : reject(new Error(`Native smoke exited ${code}`)))
  })
})

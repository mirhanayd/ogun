#!/usr/bin/env node

import { copyFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '..')
const source = resolve(repoRoot, '.env')
const target = resolve(repoRoot, 'apps/web/.env.local')

// CI/production ortamları secret'ları platformdan process.env olarak alır;
// bu ortamlarda repoda .env bulunmaması normaldir ve dosya üretmemeliyiz.
if (!existsSync(source)) {
  console.log('[sync-web-env] Kök .env bulunamadı; platform ortam değişkenleri kullanılacak.')
  process.exit(0)
}

// Monorepo kökündeki .env tek yerel doğruluk kaynağıdır. Next.js
// apps/web/.env.local dosyasını kök .env'den önce okuduğu için eski bir
// kopya web'i localhost veritabanına, desktop'ı Neon'a yönlendirebilir.
// Dosya gitignore altındadır; değerleri konsola hiçbir zaman yazdırma.
copyFileSync(source, target)
console.log('[sync-web-env] apps/web/.env.local kök .env ile senkronlandı.')

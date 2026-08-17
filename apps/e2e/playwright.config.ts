import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'

// GitHub issue #45 / Prompt 8.1, GÖREV 3 — E2E test kurulumu (Playwright).
//
// KONUM KARARI (ürün kararı DEĞİL, bir uygulama detayı — bkz. görev
// talimatındaki "your call on the cleanest structure"): AYRI bir
// `apps/e2e` workspace paketi seçildi, apps/web İÇİNE gömülmek YERİNE.
// Gerekçe:
//   1. Playwright'ın kendi bağımlılıkları (tarayıcı ikilileri, ~300MB+)
//      apps/web'in normal `pnpm install`/build akışına HİÇ girmemeli —
//      apps/web sadece `next build` çalıştıran bir CI adımı Playwright
//      indirmeyi TETİKLEMEMELİ.
//   2. E2E testleri apps/web'in birim testleriyle (vitest, `pnpm --filter
//      web test`) AYNI komutta ÇALIŞTIRILMAMALI — biri saniyeler içinde
//      biter (vitest), diğeri dakikalar sürebilir + gerçek bir DB/sunucu
//      ister; ayrı bir paket bu ikisini turbo.json'da ayrı task'lar
//      (`test` vs `e2e`) olarak tutmayı doğal kılıyor.
//   3. İleride birden fazla "app" (ör. bir danışan mobil PWA'sı, v1.1)
//      eklenirse E2E'ler tek bir yerden ikisini de kapsayabilir — apps/web'e
//      gömülü olsaydı bu doğal olarak apps/web'e özel kalırdı.
//
// ÇALIŞTIRMA: `pnpm --filter @ogun/e2e test` — webServer bloğu apps/web'in
// dev sunucusunu OTOMATİK ayağa kaldırır (zaten çalışıyorsa yeniden
// kullanır). Testlerden ÖNCE `pnpm --filter @ogun/e2e seed` çalıştırılmalı
// (bkz. fixtures/seed-e2e.ts) — testler GERÇEK bir Postgres'e karşı
// çalışır, mock YOK.
const PORT = process.env.E2E_PORT ?? '3100'
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // Testler AYNI DB üzerinde paylaşılan fixture verisi kullanıyor.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  timeout: 30_000,
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // NOT: `next dev --turbopack` DEĞİL, önce `next build` (Turbopack'SIZ,
  // bkz. apps/web/package.json "build" script'i --turbopack kullanıyor ama
  // bu sandbox'ta apps/web/src/instrumentation.ts + better-auth'un
  // "@better-auth/core" alt-yol dışa aktarımları, iç içe (nested) bir git
  // worktree'sinde Turbopack'in modül çözümlemesini KIRIYOR — bu, göreve
  // önceden bildirilen "@better-auth/core/Turbopack nested-worktree
  // false-positive"in TA KENDİSİ, `pnpm --filter web build` ile REPRODUCE
  // edilip clean master'da da AYNEN var olduğu doğrulandı). Sade webpack
  // build'i (`next build`, --turbopack OLMADAN) bu sorunu YAŞAMIYOR — bu
  // yüzden E2E'ler `next start` ile o build'e karşı çalıştırılıyor.
  // ÖNCE ÇALIŞTIRIN: `npx next build` (apps/web içinde, --turbopack'sız).
  webServer: {
    command: `pnpm --filter web exec next start -p ${PORT}`,
    cwd: path.resolve(__dirname, '../..'),
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_BETTER_AUTH_URL: BASE_URL,
      BETTER_AUTH_URL: BASE_URL,
    },
  },
})

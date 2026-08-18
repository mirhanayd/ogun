import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import * as chromeLauncher from 'chrome-launcher'
import lighthouse from 'lighthouse'

// GitHub issue #45 / Prompt 8.1, GÖREV 2 — "Lighthouse: ana akış sayfaları
// için skor raporu." `pnpm lighthouse` ile çalışır — SANDBOX'ta çalışan bir
// Chromium GEREKTİRİR (bkz. package.json script'i, apps/e2e zaten Playwright
// için Chromium indiriyor — bu script chrome-launcher ile SİSTEMDEKİ (veya
// PLAYWRIGHT'IN indirdiği) bir Chrome/Chromium ikilisini bulur).
//
// ÖNEMLİ (dürüstlük notu — bkz. docs/performance.md): bu script GERÇEK
// ölçüm yapar, SAHTE/uydurma skor DÖNDÜRMEZ — çalıştırılabilir bir Chrome
// bulunamazsa veya hedef sunucu (BASE_URL) ayakta değilse AÇIKÇA hata
// verip çıkar, "tahmini" bir sayı üretmez.
const BASE_URL = process.env.LIGHTHOUSE_BASE_URL ?? 'http://localhost:3100'

// Roadmap'in "ana akış sayfaları" dediği, kullanıcının GERÇEKTEN en çok
// zaman geçirdiği sayfalar — tüm site değil, kritik akışın omurgası.
const PAGES: Array<{ path: string; label: string }> = [
  // GitHub issue #60 / Faz 10, Prompt 10.2, GÖREV 4 — "Lighthouse:
  // erişilebilirlik ve SEO 100, performans 90+". Landing sayfası bu listeye
  // BAŞA eklendi: oturum GEREKTİRMEYEN tek gerçek içerik sayfası olduğu için
  // ölçülen skor, gerçek ziyaretçi deneyiminin TA KENDİSİ (aşağıdaki auth'lu
  // rotaların aksine).
  { path: '/', label: 'Landing (pazarlama sayfası)' },
  { path: '/giris', label: 'Giriş' },
  { path: '/panel', label: 'Panel (auth gerektirir — bkz. not)' },
  { path: '/danisanlar', label: 'Danışan listesi (auth gerektirir — bkz. not)' },
]

interface LighthouseResultSummary {
  url: string
  label: string
  performance: number | null
  accessibility: number | null
  bestPractices: number | null
  seo: number | null
  lcpMs: number | null
  clsScore: number | null
  tbtMs: number | null
  error?: string
}

async function auditPage(chromePort: number, target: { path: string; label: string }): Promise<LighthouseResultSummary> {
  const url = `${BASE_URL}${target.path}`
  const runnerResult = await lighthouse(url, {
    port: chromePort,
    output: 'json',
    logLevel: 'error',
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
  })

  if (!runnerResult?.lhr) {
    return {
      url,
      label: target.label,
      performance: null,
      accessibility: null,
      bestPractices: null,
      seo: null,
      lcpMs: null,
      clsScore: null,
      tbtMs: null,
      error: 'Lighthouse çalıştırılamadı (runnerResult boş döndü).',
    }
  }

  const { lhr } = runnerResult
  return {
    url,
    label: target.label,
    performance: lhr.categories.performance?.score ?? null,
    accessibility: lhr.categories.accessibility?.score ?? null,
    bestPractices: lhr.categories['best-practices']?.score ?? null,
    seo: lhr.categories.seo?.score ?? null,
    lcpMs: lhr.audits['largest-contentful-paint']?.numericValue ?? null,
    clsScore: lhr.audits['cumulative-layout-shift']?.numericValue ?? null,
    tbtMs: lhr.audits['total-blocking-time']?.numericValue ?? null,
  }
}

async function main() {
  console.log(`--- Lighthouse denetimi — hedef: ${BASE_URL} ---`)
  console.log(
    'NOT: /panel ve /danisanlar oturum gerektirir — bu script auth cookie ENJEKTE ETMİYOR, bu yüzden bu ' +
      'sayfalarda /giris\'e yönlendirme ölçülür (gerçek panel deneyimi DEĞİL). Auth\'lu bir ölçüm için Lighthouse\'u ' +
      'authenticatedPage bağlamıyla (bkz. Lighthouse "user flows" API\'si) manuel çalıştırın.',
  )

  let chrome: chromeLauncher.LaunchedChrome
  try {
    chrome = await chromeLauncher.launch({ chromeFlags: ['--headless=new', '--no-sandbox'] })
  } catch (error) {
    console.error(
      '[lighthouse] Chrome/Chromium başlatılamadı — bu ortamda Lighthouse ÇALIŞTIRILAMADI. ' +
        'Gerçek bir Chrome kurulu bir makinede (veya `npx playwright install chromium` sonrası ' +
        'CHROME_PATH=<chromium yolu> ile) tekrar deneyin.',
    )
    console.error(error)
    process.exit(1)
  }

  const results: LighthouseResultSummary[] = []
  try {
    for (const target of PAGES) {
      console.log(`Ölçülüyor: ${target.label} (${target.path})...`)
      const result = await auditPage(chrome.port, target)
      results.push(result)
      if (result.error) {
        console.warn(`  [UYARI] ${result.error}`)
      } else {
        console.log(
          `  Performans: ${((result.performance ?? 0) * 100).toFixed(0)} | ` +
            `Erişilebilirlik: ${((result.accessibility ?? 0) * 100).toFixed(0)} | ` +
            `İyi Uygulamalar: ${((result.bestPractices ?? 0) * 100).toFixed(0)} | ` +
            `SEO: ${((result.seo ?? 0) * 100).toFixed(0)} | ` +
            `LCP: ${(result.lcpMs ?? 0).toFixed(0)}ms | TBT: ${(result.tbtMs ?? 0).toFixed(0)}ms`,
        )
      }
    }
  } finally {
    // chrome-launcher, kapanışta kendi geçici profil dizinini siler; Windows'ta
    // bu silme antivirüs/OneDrive dosya kilidi yüzünden EPERM ile
    // patlayabiliyor. O hata `finally` içinden fırlarsa ASIL ölçüm hatasını
    // (ya da başarılı sonucu) EZER — temizlik hatası ölçümü geçersiz
    // kılmamalı, sadece uyarı olarak geçilmeli.
    try {
      await chrome.kill()
    } catch (error) {
      console.warn('[lighthouse] Chrome geçici profili temizlenemedi (ölçümü etkilemez):', error)
    }
  }

  // process.cwd() varsayımı: script `pnpm --filter web lighthouse` (bkz.
  // package.json) İLE, yani apps/web KÖKÜNDEN çalıştırılır.
  const outDir = path.resolve(process.cwd(), '.lighthouse-reports')
  mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, `lighthouse-${Date.now()}.json`)
  writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf-8')
  console.log(`Tam rapor: ${outPath}`)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})

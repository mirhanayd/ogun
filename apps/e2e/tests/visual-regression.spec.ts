import { expect, test, type Browser, type Page } from '@playwright/test'
import { loadE2eCredentials, loginAndEnsureOnboarded } from '../fixtures/auth'

// GitHub issue #62 / Faz 10, Prompt 10.4, GÖREV 4 — "Playwright ile ana
// ekranların ekran görüntüsü testi (açık + koyu tema). Bundan sonraki UI
// değişikliklerinde kazara bozulma yakalanır."
//
// NASIL ÇALIŞIR: `toHaveScreenshot()` referans (baseline) PNG'lerle
// karşılaştırır. Referanslar YOKSA Playwright onları yazar ve koşuyu
// BAŞARISIZ sayar (bilerek — "ilk koşu her zaman geçer" bir regresyon testi
// değildir). Referansları üretmek/güncellemek için:
//
//   pnpm --filter @ogun/e2e test visual-regression --update-snapshots
//
// Referans dosyaları platform adını taşır (Playwright'ın varsayılan
// `snapshotPathTemplate`i {projectName}-{platform} eki koyar), çünkü font
// rasterizasyonu Windows/Linux/macOS'ta AYNI DEĞİLDİR — bu depoda üretilenler
// win32 içindir; Linux'ta ilk koşu kendi referanslarını üretir.
//
// DETERMİNİZM (bu testin en kırılgan yanı, bilerek ele alındı):
//   - TARİHE BAĞLI ekranlar SABİT tarihle açılıyor: randevu takvimi ve finans
//     sayfası gezinme durumunu URL'de tutuyor (bkz. randevular/page.tsx
//     `?view=&date=`, finans/page.tsx `?month=`), bu yüzden "bugün"e göre
//     değişen bir görüntü ÜRETİLMİYOR. Bu bir hile değil, sayfaların ZATEN
//     var olan davranışı.
//   - Fixture kliniğinde (bkz. fixtures/seed-e2e.ts) danışan/plan/randevu
//     YOK; yani bu suite aynı zamanda GÖREV 1'in BOŞ DURUMLARINI (marka
//     illüstrasyonlu EmptyState) doğrudan koruyor.
//   - Animasyonlar `animations: 'disabled'` ile donduruluyor.
//
// PLAN EDİTÖRÜ BİLEREK KAPSAM DIŞI: o ekran hazır olmak için tarayıcıdaki
// besin indeksinin (~15.400 kayıt, Dexie+Orama) kurulmasını bekliyor ve bu
// sandbox'ta dakikalar sürüyor; ayrıca #60'tan beri onun için AYRI ve daha
// güçlü bir araç var (apps/e2e/scripts/capture-plan-editor.ts, #61'de
// CAPTURE_THEME/CAPTURE_OUT_PATH ile açık+koyu tema desteği eklendi).
const THEMES = ['light', 'dark'] as const

interface Screen {
  name: string
  path: string
  // Ekranın GERÇEKTEN yüklendiğini kanıtlayan metin — sabit bir bekleme
  // (waitForTimeout) yerine bu kullanılıyor.
  readyText: string
}

// Oturum GEREKTİREN ana ekranlar.
const APP_SCREENS: Screen[] = [
  { name: 'panel', path: '/panel', readyText: 'Bugüne dair özet' },
  { name: 'danisanlar', path: '/danisanlar', readyText: 'Henüz danışan yok' },
  { name: 'planlar', path: '/planlar', readyText: 'Şablon kütüphanesi' },
  { name: 'sablonlar', path: '/planlar/sablonlar', readyText: 'Henüz şablon yok' },
  {
    name: 'randevular',
    path: '/randevular?view=week&date=2026-03-02',
    readyText: 'Bu aralıkta randevu yok',
  },
  { name: 'tarifler', path: '/tarifler', readyText: 'Henüz tarif yok' },
  { name: 'finans', path: '/finans?month=2026-03', readyText: 'Aylık gelir/gider özeti' },
]

// Oturum GEREKTİRMEYEN ekranlar (landing, giriş, 404).
const PUBLIC_SCREENS: Screen[] = [
  { name: 'landing', path: '/', readyText: 'Diyet listesi 15 dakikada değil, 90 saniyede.' },
  { name: 'giris', path: '/giris', readyText: 'Öğün hesabınıza giriş yapın' },
  { name: 'bulunamadi', path: '/boyle-bir-sayfa-yok', readyText: 'Böyle bir sayfa yok' },
]

async function newThemedPage(browser: Browser, theme: (typeof THEMES)[number]): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: theme,
  })
  // next-themes tercihi localStorage'ta 'theme' anahtarında tutulur (bkz.
  // apps/web/src/app/providers.tsx `<ThemeProvider attribute="class">`).
  // `colorScheme` TEK BAŞINA yetmez: uygulamanın varsayılanı "system" olduğu
  // için ikisi birlikte yazıldığında tema ilk boyamada kesinleşir. AYNI
  // yaklaşım scripts/capture-plan-editor.ts'te de kullanılıyor (#61).
  await context.addInitScript(`window.localStorage.setItem('theme', '${theme}')`)
  return context.newPage()
}

async function captureScreen(page: Page, screen: Screen, theme: string): Promise<void> {
  await page.goto(screen.path, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText(screen.readyText).first()).toBeVisible({ timeout: 30_000 })
  // Web fontları (next/font ile self-host edilen Inter) yüklenmeden alınan
  // görüntü sistem yazı tipiyle rasterize olur ve HER koşuda farklı çıkar.
  await page.evaluate(() =>
    (globalThis as unknown as { document: { fonts: { ready: Promise<unknown> } } }).document.fonts
      .ready,
  )
  // expect.soft: bir ekranın farkı, geri kalan ekranların karşılaştırılmasını
  // ENGELLEMESİN — tek koşuda TÜM farklar raporlansın.
  await expect.soft(page).toHaveScreenshot(`${screen.name}-${theme}.png`, {
    animations: 'disabled',
    // Alt piksel farklarına (font hinting, gölge kenarları) karşı küçük bir
    // tolerans; GERÇEK bir düzen/renk değişikliği bu eşiğin çok üstünde fark
    // üretir.
    maxDiffPixelRatio: 0.01,
  })
}

for (const theme of THEMES) {
  test.describe(`Görsel regresyon — ${theme === 'light' ? 'açık' : 'koyu'} tema`, () => {
    test(`genel ekranlar (${theme})`, async ({ browser }) => {
      test.setTimeout(120_000)
      const page = await newThemedPage(browser, theme)
      try {
        for (const screen of PUBLIC_SCREENS) {
          await captureScreen(page, screen, theme)
        }
      } finally {
        await page.context().close()
      }
    })

    test(`uygulama ekranları (${theme})`, async ({ browser }) => {
      test.setTimeout(180_000)
      const credentials = loadE2eCredentials()
      const page = await newThemedPage(browser, theme)
      try {
        // BİLEREK klinik A DEĞİL: critical-flow ve keyboard-navigation
        // testleri klinik A'ya gerçek danışan/plan yazıyor, o klinikteki
        // listeler koşu sırasına göre değişirdi. `visual` kliniğine hiçbir
        // test veri yazmaz (bkz. fixtures/seed-e2e.ts).
        await loginAndEnsureOnboarded(page, credentials.visual.email, credentials.visual.password)
        await expect(page).toHaveURL(/\/panel/)
        for (const screen of APP_SCREENS) {
          await captureScreen(page, screen, theme)
        }
      } finally {
        await page.context().close()
      }
    })
  })
}

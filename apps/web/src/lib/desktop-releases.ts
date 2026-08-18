// GitHub issue #54 / Prompt 9.4, GÖREV 4 — `/indir` sayfasının (bkz.
// apps/web/src/app/indir/page.tsx) okuduğu masaüstü sürüm verisi.
//
// NEDEN STATİK/ELLE GÜNCELLENEN BİR DOSYA — GERÇEK ZAMANLI R2 MANİFEST
// FETCH DEĞİL: `/indir` (apps/web, Next.js) ile `tauri-plugin-updater`nin
// (apps/desktop, bkz. src-tauri/src/updater.rs) güncelleme manifesti FARKLI
// TÜKETİCİLERdir — aynı JSON şemasını paylaşmak ZORUNDA değiller. R2
// kovası + gerçek sürümler bu sandbox'ta henüz YOK (bkz. docs/
// desktop-deployment.md "Credential-pending" notu); bu yüzden veri şimdilik
// buraya ELLE eklenir (her `desktop-v*` release'inde bir satır). R2 manifest
// canlı olduğunda bu dosya bir sunucu bileşeninde `fetch(process.env.
// OGUN_UPDATE_MANIFEST_URL + '/latest.json', { next: { revalidate: 3600 } })`
// ile DEĞİŞTİRİLEBİLİR — bu issue'nun kapsamı DIŞINDA bir gelecek
// iyileştirme.

export type DesktopPlatform = 'windows' | 'macos'

export interface DesktopDownloadAsset {
  platform: DesktopPlatform
  /** Kullanıcıya gösterilen kısa etiket, ör. ".msi (Windows Installer)". */
  label: string
  url: string
}

export interface DesktopRelease {
  version: string
  /** ISO 8601 — ör. "2026-08-18". */
  publishedAt: string
  /** Türkçe sürüm notları, madde madde. */
  notes: string[]
  downloads: DesktopDownloadAsset[]
}

// GERÇEK bir sürüm HENÜZ yayınlanmadı (bkz. docs/desktop-deployment.md
// "Yayın kontrol listesi" — ilk `desktop-v*` etiketi push edilip GitHub
// Release'i elle yayınlandığında burası GERÇEK indirme linkleriyle
// doldurulmalı). Dizi boşken `/indir` sayfası "ilk sürüm hazırlanıyor"
// durumunu gösterir (bkz. o sayfanın dosya başı notu) — tamamen boş/kırık
// bir sayfa DEĞİL.
export const DESKTOP_RELEASES: DesktopRelease[] = []

export function getLatestDesktopRelease(): DesktopRelease | null {
  return DESKTOP_RELEASES[0] ?? null
}

export const DESKTOP_PLATFORM_LABELS: Record<DesktopPlatform, string> = {
  windows: 'Windows',
  macos: 'macOS',
}

export const DESKTOP_SYSTEM_REQUIREMENTS: Record<DesktopPlatform, string[]> = {
  windows: [
    'Windows 10 (64-bit) veya üzeri',
    'WebView2 Runtime (çoğu güncel Windows kurulumunda zaten yüklüdür; yoksa kurulum sırasında otomatik istenir)',
  ],
  macos: [
    // bkz. src-tauri/tauri.conf.json bundle.macOS.minimumSystemVersion
    'macOS 10.15 (Catalina) veya üzeri',
    'Apple Silicon (M serisi) ve Intel işlemcilerin İKİSİNDE de çalışan TEK bir evrensel (universal) kurulum dosyası',
  ],
}

export const DESKTOP_INSTALL_STEPS: Record<DesktopPlatform, string[]> = {
  windows: [
    '.msi ya da .exe dosyasını indirin — ikisi de aynı uygulamayı kurar; .msi kurumsal/toplu dağıtım için, .exe (NSIS) çoğu kullanıcı için daha hızlı ve daha küçüktür.',
    'İndirilen dosyayı çalıştırın ve kurulum sihirbazını izleyin.',
    'Kurulum tamamlandığında uygulama Başlat menüsünde "Öğün" olarak görünür.',
  ],
  macos: [
    '.dmg dosyasını indirin ve açın.',
    'Açılan pencerede Öğün simgesini "Applications" (Uygulamalar) klasörüne sürükleyin.',
    'İlk açılışta macOS Gatekeeper "doğrulanamayan geliştirici" uyarısı gösterebilir — sağ tık > Aç ile devam edilebilir; Apple Developer imzalama/notarization tamamlandığında (bkz. docs/desktop-deployment.md) bu uyarı kalkacaktır.',
  ],
}

// GitHub issue #35 / Prompt 6.1 — "Türkçe karakter destekli font embedding
// (Inter veya Source Sans, latin-ext subset)". Bu dosya SADECE Node
// tarafında (sunucu PDF üretimi, render.ts) import edilir — node:fs/node:url
// kullandığı için index.ts'in ana barrel'ından BİLEREK dışa aktarılmıyor,
// aksi halde apps/web'in istemci tarafı önizleme bundle'ı (PDFViewer,
// tarayıcıda çalışır) bu dosyayı da paketlemeye çalışıp webpack'te
// "Module not found: node:fs" hatası verirdi. Tarayıcı tarafı font kaydı
// apps/web/src/lib/pdf/register-pdf-fonts-client.ts'te AYRI VE URL tabanlı
// (public/fonts/pdf/*.ttf) yapılır — aynı .ttf dosyalarının bir kopyası
// oraya da vendor edildi (bkz. o dosyanın notu).
//
// SEÇİM: Inter, statik (variable OLMAYAN) TTF ağırlıkları — rsms/inter
// GitHub reposunun v4.0 sürüm paketinden (extras/ttf/) Regular/Medium/
// SemiBold/Bold. Inter'in Latin Extended karakter kümesi Türkçe'nin tüm
// özel karakterlerini (ı, İ, ş, Ş, ğ, Ğ, ü, Ü, ö, Ö, ç, Ç) kapsar. Değişken
// (variable) font dosyası BİLEREK kullanılmadı — react-pdf/fontkit değişken
// font eksenlerini (opsz/wght) instance etmeden tek bir varsayılan ağırlığa
// sabitliyor, ayrı statik ağırlık dosyaları kalın/yarı kalın metinlerin
// (başlıklar, öğün adları) görsel olarak ayrışmasını sağlıyor.
//
// SANDBOX NOTU: bu paket bu PR'de GERÇEKTEN ağa çıkıp github.com/rsms/inter
// v4.0 release ZIP'inden indirilen dosyalarla vendor edildi — "ağ erişimi
// yok, fallback kullanıldı" durumu YAŞANMADI (bkz. PR açıklaması).
import { Font } from '@react-pdf/renderer'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { INTER_FONT_FAMILY } from './font-family'

// Her varlığı statik bir URL olarak belirtmek Next.js/@vercel/nft dosya
// izleyicisinin TTF bağımlılıklarını görmesini sağlar. Turbopack/webpack bu
// URL'leri production build'de .next/static/media altında hash'li varlıklara
// çevirir; düz Node/Vitest ise doğrudan paket içindeki dosyaları kullanır.
const FONT_ASSETS = {
  regular: {
    fileName: 'Inter-Regular.ttf',
    url: new URL('./fonts/Inter-Regular.ttf', import.meta.url),
  },
  medium: {
    fileName: 'Inter-Medium.ttf',
    url: new URL('./fonts/Inter-Medium.ttf', import.meta.url),
  },
  semiBold: {
    fileName: 'Inter-SemiBold.ttf',
    url: new URL('./fonts/Inter-SemiBold.ttf', import.meta.url),
  },
  bold: { fileName: 'Inter-Bold.ttf', url: new URL('./fonts/Inter-Bold.ttf', import.meta.url) },
} as const

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))

type FontAsset = {
  fileName: string
  url: Pick<URL, 'protocol' | 'pathname'>
}

type FontResolutionContext = {
  cwd: string
  moduleDir: string
  fileExists: (filePath: string) => boolean
}

export function resolveFontFile(
  asset: FontAsset,
  context: FontResolutionContext = {
    cwd: process.cwd(),
    moduleDir: MODULE_DIR,
    fileExists: existsSync,
  },
): string {
  // Bundler olmadan çalışan Node sürecinde URL zaten gerçek TTF'ye gider.
  if (asset.url.protocol === 'file:') return fileURLToPath(asset.url as URL)

  // Turbopack'in sunucu runtime'ı `new URL(asset, import.meta.url)` ifadesini
  // protokolsüz `/_next/static/media/<hash>.ttf` URL'sine dönüştürür.
  // react-pdf bir HTTP URL'si değil yerel dosya yolu istediği için, browser
  // PDF önizlemesinin de kullandığı vendor edilmiş public kopyayı öncelikli
  // olarak çözüyoruz. Next/Vercel route trace'i bu dosyaları fonksiyon paketine
  // dahil eder; Docker ve Tauri paketleyicileri de public dizinini kopyalar.
  // Hash'li .next varlığı, public kopya bulunamazsa ikinci güvencedir.
  const nextRelativePath = path.join('.next', asset.url.pathname.replace(/^\/_next\//, ''))
  const publicRelativePath = path.join('public', 'fonts', 'pdf', asset.fileName)
  const monorepoRoot = path.resolve(context.moduleDir, '../../..')
  const candidates = [
    path.resolve(context.cwd, publicRelativePath),
    path.resolve(context.cwd, 'apps/web', publicRelativePath),
    path.resolve(monorepoRoot, 'apps/web', publicRelativePath),
    path.resolve(context.cwd, nextRelativePath),
    path.resolve(context.cwd, 'apps/web', nextRelativePath),
    path.resolve(monorepoRoot, 'apps/web', nextRelativePath),
  ]
  const bundledFile = candidates.find((candidate) => context.fileExists(candidate))
  if (bundledFile) return bundledFile

  // Son aday hata mesajını kanonik, anlaşılır bir yolda tutar. Normalde
  // bundler asset'i izlediği için yukarıdaki adaylardan biri mutlaka vardır.
  return path.join(context.moduleDir, 'fonts', asset.fileName)
}

const FONT_FILES = {
  regular: resolveFontFile(FONT_ASSETS.regular),
  medium: resolveFontFile(FONT_ASSETS.medium),
  semiBold: resolveFontFile(FONT_ASSETS.semiBold),
  bold: resolveFontFile(FONT_ASSETS.bold),
} as const

let registered = false

// idempotent: render.ts her çağrıda tekrar register etmeye çalışabilir
// (ör. testte birden fazla renderPlanPdfBuffer çağrısı) — react-pdf aynı
// aile adını iki kez register etmeyi hata saymaz ama gereksiz dosya
// okumasını önlemek için burada da bir bayrak tutuluyor.
export function registerPdfFontsNode(): void {
  if (registered) return
  for (const filePath of Object.values(FONT_FILES)) {
    if (!existsSync(filePath)) {
      throw new Error(
        `[@ogun/pdf] Font dosyası bulunamadı: ${filePath}. packages/pdf/src/fonts/*.ttf ` +
          'vendor edilmiş olmalı — bkz. fonts.node.ts dosya başı notu.',
      )
    }
  }
  Font.register({
    family: INTER_FONT_FAMILY,
    fonts: [
      { src: FONT_FILES.regular, fontWeight: 400 },
      { src: FONT_FILES.medium, fontWeight: 500 },
      { src: FONT_FILES.semiBold, fontWeight: 600 },
      { src: FONT_FILES.bold, fontWeight: 700 },
    ],
  })
  // Otomatik (İngilizce kurallı) kelime tirelemesini kapatıyoruz — Türkçe
  // uzun kelimelerin (ör. "diyetisyen", şehir/klinik adları) YANLIŞ
  // hecelerden bölünmesini önlemek için (bkz. react-pdf
  // Font.registerHyphenationCallback dokümanı).
  Font.registerHyphenationCallback((word) => [word])
  registered = true
}

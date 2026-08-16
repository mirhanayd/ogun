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

const FONTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fonts')

const FONT_FILES = {
  regular: path.join(FONTS_DIR, 'Inter-Regular.ttf'),
  medium: path.join(FONTS_DIR, 'Inter-Medium.ttf'),
  semiBold: path.join(FONTS_DIR, 'Inter-SemiBold.ttf'),
  bold: path.join(FONTS_DIR, 'Inter-Bold.ttf'),
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

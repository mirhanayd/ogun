import Image from 'next/image'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

// GitHub issue #60 / Faz 10, Prompt 10.2, GÖREV 1 — "Üst bar:
// ogun-logo-yatay.svg + Giriş / [birincil eylem]".
//
// BİRİNCİL EYLEM "ÜCRETSİZ DENE" DEĞİL, "İNDİR" — spec'in bu satırı Faz 9'dan
// ÖNCE yazıldı (bkz. faz-10-ui-cilasi.md dosya başındaki NOT bloğu: prompt'lar
// "orijinal olarak tarayıcı tabanlı web uygulaması varsayımıyla yazıldı").
// Faz 9'da asıl ürün Tauri masaüstü uygulamasına taşındı ve web yüzeyi
// hesap + abonelik + indirmeye indirildi (bkz. apps/web/src/app/indir/page.tsx
// dosya başı notu). Tarayıcıda "denenebilecek" bir ürün ARTIK YOK; bu yüzden
// birincil eylem indirmeye, ikincil eylem hesap açmaya (14 günlük denemenin
// GERÇEKTEN başladığı yer) gidiyor.
//
// LOGO İKİ TEMADA İKİ DOSYA: ogun-logo-yatay.svg'nin kelime markası
// #1B7A5A ile dolduruluyor (gömülü hex, currentColor DEĞİL) — koyu zeminde
// bu renk okunmuyor. Markanın kendi koyu-zemin kilidi (ogun-logo-koyu-zemin.svg)
// tam olarak bunun için var. İkisi de sunucuda basılıp CSS ile
// gösteriliyor/gizleniyor: tema değişiminde takırdama (flash) YOK, istemci
// JavaScript'i GEREKMİYOR.
//
// `unoptimized`: Next.js görüntü iyileştiricisi SVG'yi varsayılan olarak
// reddeder (`dangerouslyAllowSVG` gerekir). Bu bayrak dosyayı olduğu gibi
// (statik) sunar — vektör zaten 5 KB, iyileştirilecek bir şey yok.
const LOGO_WIDTH = 154
const LOGO_HEIGHT = 76

const NAV_LINKS = [
  { href: '#neden-ogun', label: 'Neden Öğün' },
  { href: '#kaynaklar', label: 'Kaynaklar' },
  { href: '#fiyatlandirma', label: 'Paketler' },
  { href: '#sss', label: 'SSS' },
]

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none" aria-label="Öğün ana sayfa">
          <Image
            src="/brand/ogun-logo-yatay.svg"
            alt="Öğün"
            width={LOGO_WIDTH}
            height={LOGO_HEIGHT}
            priority
            unoptimized
            className="h-9 w-auto dark:hidden"
          />
          <Image
            src="/brand/ogun-logo-koyu-zemin.svg"
            alt="Öğün"
            width={200}
            height={104}
            priority
            unoptimized
            className="hidden h-9 w-auto dark:block"
          />
        </Link>

        <nav aria-label="Sayfa bölümleri" className="hidden flex-1 items-center justify-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 text-body text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <Button asChild variant="ghost" size="lg">
            <Link href="/giris">Giriş</Link>
          </Button>
          <Button asChild size="lg">
            <Link href="/indir">İndir</Link>
          </Button>
        </div>
      </div>
    </header>
  )
}

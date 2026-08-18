import type { Metadata } from 'next'
import { Faq } from './_landing/faq'
import { Hero } from './_landing/hero'
import { Pricing } from './_landing/pricing'
import { PilotContact } from './_landing/pilot-contact'
import { ProductShot } from './_landing/product-shot'
import { SiteFooter } from './_landing/site-footer'
import { SiteHeader } from './_landing/site-header'
import { SourceTransparency } from './_landing/source-transparency'
import { ValueSections } from './_landing/value-sections'
import { absoluteUrl } from '@/lib/site-url'

// GitHub issue #60 / Faz 10, Prompt 10.2 — "apps/web/src/app/page.tsx şu an
// 8 satırlık bir stub ('Öğün' + 'Yakında'). Pilot diyetisyenlerin göreceği
// ilk ekran bu. Gerçek bir sayfa yaz."
//
// SPEC'İN GÜNCEL OLMAYAN KISMI VE NASIL UZLAŞTIRILDIĞI (bkz. ayrıca
// _landing/site-header.tsx ve _landing/hero.tsx dosya başı notları):
// spec'in GÖREV 1'i birincil eylem olarak "Ücretsiz dene" ve ikincil eylem
// olarak "demo izle" diyor. İkisi de Faz 9 ÖNCESİ varsayımlar:
//   - "Ücretsiz dene": tarayıcıda denenecek bir ürün ARTIK YOK; asıl ürün
//     Tauri masaüstü uygulaması (bkz. faz-9-masaustu-kabugu.md KARAR notu ve
//     faz-10-ui-cilasi.md tepesindeki NOT bloğu). Birincil eylem "İndir"
//     (→ /indir, #54) oldu; 14 günlük ücretsiz deneme KAYBOLMADI, ikincil
//     eyleme ("Hesap oluştur", → /kayit) taşındı — denemenin GERÇEKTEN
//     başladığı yer orası (bkz. lib/subscription/plans.ts TRIAL_PLAN_LIMITS).
//   - "Demo izle": GERÇEK bir demo videosu YOK. Var olmayan bir videoya
//     bağlantı vermek yerine ürünün GERÇEK ekran görüntüsü (bkz.
//     _landing/product-shot.tsx) kahramanın hemen altına kondu.
//
// `/indir` İLE İLİŞKİ: bağlantı verildi, KOPYALANMADI. İşletim sistemi
// algılama, indirme bağlantıları, sistem gereksinimleri ve kurulum adımları
// TEK yerde (`/indir`) kalıyor; landing yalnızca `getLatestDesktopRelease()`
// VERİSİNİ okuyup sürüm durumunu doğru gösteriyor (bkz. hero.tsx).
const TITLE = 'Öğün — Klinik diyetisyenler için besin bileşim motoru'
const DESCRIPTION =
  'Diyet listesi 15 dakikada değil 90 saniyede. Öğün, serbest metin kutusu yerine gerçek bir besin bileşim motoru sunar: siz yazarken enerji, makro ve mikro besin öğesi yeterliliği anında hesaplanır. Windows ve macOS için masaüstü uygulaması.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: absoluteUrl('/') },
  openGraph: {
    type: 'website',
    locale: 'tr_TR',
    siteName: 'Öğün',
    title: TITLE,
    description: DESCRIPTION,
    url: absoluteUrl('/'),
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
}

export default function Home() {
  return (
    <div className="flex min-h-svh flex-col">
      <a
        href="#icerik"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        İçeriğe geç
      </a>
      <SiteHeader />
      <main id="icerik" className="flex-1">
        <Hero />
        <ProductShot />
        <ValueSections />
        <SourceTransparency />
        <Pricing />
        <PilotContact />
        <Faq />
      </main>
      <SiteFooter />
    </div>
  )
}

import type { Metadata } from 'next'
import { Faq } from './_landing/faq'
import { FinalCta } from './_landing/final-cta'
import { Hero } from './_landing/hero'
import { ProductShot } from './_landing/product-shot'
import { SiteFooter } from './_landing/site-footer'
import { SiteHeader } from './_landing/site-header'
import { SourceTransparency } from './_landing/source-transparency'
import { ValueSections } from './_landing/value-sections'
import { absoluteUrl } from '@/lib/site-url'

const TITLE = 'Öğün — Diyetisyen klinikleri için beslenme planlama ve danışan takibi'
const DESCRIPTION =
  'Diyet listesi 15 dakikada değil 90 saniyede. Öğün; besin bileşim motorunu, danışan takibini ve klinik ekip çalışmasını aynı çalışma alanında buluşturur.'

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
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  )
}

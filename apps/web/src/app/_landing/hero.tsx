import Link from 'next/link'
import { ArrowRight, Download } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getLatestDesktopRelease } from '@/lib/desktop-releases'
import { HERO } from './content'

// GitHub issue #60 / Faz 10, Prompt 10.2, GÖREV 1 — kahraman bölümü.
//
// `/indir` İLE İLİŞKİ (bkz. site-header.tsx dosya başı notu): indirme
// AKIŞININ tamamı — işletim sistemi algılama, platform başına indirme
// bağlantıları, sistem gereksinimleri, kurulum adımları, sürüm notları —
// #54'te yazılmış `/indir` sayfasında KALIYOR. Burada o sayfanın hiçbir
// parçası KOPYALANMADI; landing yalnızca oraya BAĞLANIYOR. Tek paylaşılan
// şey VERİ: `getLatestDesktopRelease()` (lib/desktop-releases.ts) ile gerçek
// sürüm durumu okunup rozet olarak gösteriliyor. Bileşen değil veri
// paylaşmak burada daha temiz — iki sayfanın YERLEŞİMİ farklı ama
// "yayınlanmış sürüm var mı" GERÇEĞİ tek olmalı; aksi hâlde landing "hemen
// indirin" derken `/indir` "ilk sürüm hazırlanıyor" der.
export function Hero() {
  const release = getLatestDesktopRelease()

  return (
    <section className="border-b border-border/70 bg-gradient-to-b from-accent/35 to-background">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
          <Badge variant="secondary" className="gap-1.5">
            {HERO.eyebrow}
          </Badge>

          <h1 className="text-display text-balance">{HERO.headline}</h1>

          <p className="text-lead text-balance text-muted-foreground">{HERO.subhead}</p>

          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-11 px-6 text-base">
              <Link href="/indir">
                <Download aria-hidden="true" />
                {HERO.primaryCta}
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-11 px-6 text-base">
              <Link href="/kayit">
                {HERO.secondaryCta}
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </div>

          <p className="text-helper text-muted-foreground">
            {release ? (
              <>
                Windows ve macOS · sürüm {release.version} · {HERO.secondaryCtaNote}
              </>
            ) : (
              <>
                Windows ve macOS · ilk sürüm hazırlanıyor, indirme sayfasında duyurulacak ·{' '}
                {HERO.secondaryCtaNote}
              </>
            )}
          </p>
        </div>
      </div>
    </section>
  )
}

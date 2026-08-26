import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import {
  AppWindow,
  ArrowRight,
  Check,
  Cloud,
  Download,
  Laptop,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'
import { SiteFooter } from '../_landing/site-footer'
import { SiteHeader } from '../_landing/site-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DESKTOP_INSTALL_STEPS,
  DESKTOP_SYSTEM_REQUIREMENTS,
  getLatestDesktopRelease,
} from '@/lib/desktop-releases'
import { absoluteUrl } from '@/lib/site-url'
import { DesktopDownloadCta } from './desktop-download-cta'

const TITLE = 'Öğün Masaüstü — Windows için indir'
const DESCRIPTION =
  'Öğün masaüstü uygulamasını Windows 10 ve 11 için indirin. Web hesabınızla kaldığınız yerden devam edin.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: absoluteUrl('/indir') },
  openGraph: {
    type: 'website',
    locale: 'tr_TR',
    siteName: 'Öğün',
    title: TITLE,
    description: DESCRIPTION,
    url: absoluteUrl('/indir'),
  },
}

const BENEFITS = [
  {
    icon: AppWindow,
    title: 'Kendi çalışma pencereniz',
    description: 'Tarayıcı sekmeleri arasında kaybolmadan kliniğinize odaklanın.',
  },
  {
    icon: Cloud,
    title: 'Web ile aynı hesap',
    description: 'Danışanlarınız ve planlarınız Neon’da tutulur; cihazlarınızda aynı kalır.',
  },
  {
    icon: RefreshCw,
    title: 'Kaldığınız yerden',
    description: 'Oturumunuz güvenle korunur, uygulamayı yeniden açtığınızda devam edersiniz.',
  },
]

export default function IndirPage() {
  const release = getLatestDesktopRelease()
  // Bütünlük kutusu TÜM Windows paketlerinin özetini listeler (aynı sürümün
  // .exe ve .msi'si birlikte yayınlandığında ikisi de doğrulanabilir olsun).
  const windowsChecksums =
    release?.downloads.filter((asset) => asset.platform === 'windows' && asset.sha256) ?? []
  const releaseDate = release
    ? new Intl.DateTimeFormat('tr-TR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(`${release.publishedAt}T00:00:00Z`))
    : null

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <a
        href="#icerik"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        İçeriğe geç
      </a>
      <SiteHeader />

      <main id="icerik" className="flex-1">
        <section className="relative isolate overflow-hidden bg-[#0d2a20] text-white dark:bg-[#091d17]">
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 opacity-80 [background-image:radial-gradient(circle_at_12%_18%,rgba(86,197,151,0.25),transparent_32%),radial-gradient(circle_at_88%_72%,rgba(159,225,203,0.14),transparent_28%)]"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 opacity-[0.07] [background-image:linear-gradient(rgba(255,255,255,.55)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.55)_1px,transparent_1px)] [background-size:72px_72px] [mask-image:linear-gradient(to_bottom,black,transparent_90%)]"
          />

          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col items-center pt-16 pb-12 text-center sm:pt-20 lg:pt-24">
              <div className="relative">
                <div
                  aria-hidden="true"
                  className="absolute -inset-5 rounded-[2rem] bg-emerald-400/25 blur-2xl"
                />
                <Image
                  src="/brand/ogun-uygulama-ikonu.svg"
                  alt=""
                  width={88}
                  height={88}
                  priority
                  unoptimized
                  className="relative size-20 rounded-[22%] shadow-[0_18px_45px_rgba(0,0,0,.35)] ring-1 ring-white/20 sm:size-24"
                />
              </div>

              {release ? (
                <p className="mt-8 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.07] px-3 py-1.5 text-xs font-semibold tracking-wide text-emerald-100 backdrop-blur-sm">
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-emerald-300" />
                  Sürüm {release.version}
                  {releaseDate ? ` · ${releaseDate}` : null}
                </p>
              ) : null}

              <h1 className="mt-6 text-[clamp(2.5rem,5vw,4rem)] leading-[1.02] font-semibold tracking-[-0.045em] text-balance">
                Öğün Masaüstü
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-emerald-50/75 sm:text-lg sm:leading-8">
                Kliniğiniz kendi penceresinde. Planlama ve danışan yönetimi deneyimini Windows’a
                taşıyın; web hesabınızla kaldığınız yerden devam edin.
              </p>

              <div className="mt-9 w-full max-w-md">
                {release ? (
                  <DesktopDownloadCta release={release} />
                ) : (
                  <div className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.07] px-4 py-3 text-sm text-emerald-50/75">
                    İlk masaüstü sürümü hazırlanıyor.
                  </div>
                )}
              </div>

              <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-emerald-50/65">
                <li className="inline-flex items-center gap-1.5">
                  <Check aria-hidden="true" className="size-3.5 text-emerald-300" />
                  Windows 10 ve 11
                </li>
                <li className="inline-flex items-center gap-1.5">
                  <Check aria-hidden="true" className="size-3.5 text-emerald-300" />
                  64-bit kurulum (.exe)
                </li>
                <li className="inline-flex items-center gap-1.5">
                  <Check aria-hidden="true" className="size-3.5 text-emerald-300" />
                  Web hesabınızla çalışır
                </li>
              </ul>
            </div>

            <div className="relative mx-auto max-w-5xl pb-16 sm:pb-20 lg:pb-24">
              <div
                aria-hidden="true"
                className="absolute inset-x-0 top-16 bottom-0 rounded-full bg-emerald-300/10 blur-3xl"
              />
              <figure className="relative overflow-hidden rounded-[1.6rem] border border-white/15 bg-white/[0.08] p-2 shadow-[0_35px_90px_rgba(0,0,0,.4)] backdrop-blur-sm sm:p-3">
                <div className="flex h-10 items-center gap-2 px-3" aria-hidden="true">
                  <span className="size-2 rounded-full bg-white/25" />
                  <span className="size-2 rounded-full bg-white/15" />
                  <span className="size-2 rounded-full bg-emerald-300/60" />
                  <span className="ml-3 h-4 w-36 rounded-full bg-white/[0.08]" />
                </div>
                <div className="relative aspect-[1.38/1] overflow-hidden rounded-[1.15rem] bg-[#f8fbf9] sm:aspect-[1.58/1] lg:aspect-[1.32/1]">
                  <Image
                    src="/marketing/plan-editor.png"
                    alt="Öğün masaüstü uygulamasında beslenme planı editörü"
                    width={1440}
                    height={900}
                    priority
                    sizes="(max-width: 1024px) 100vw, 1024px"
                    className="absolute inset-y-0 left-0 h-full w-auto max-w-none object-cover object-left-top"
                  />
                </div>
              </figure>
            </div>
          </div>
        </section>

        <section className="border-b border-border bg-muted/25">
          <div className="mx-auto grid max-w-7xl gap-px px-4 sm:grid-cols-3 sm:px-6 lg:px-8">
            {BENEFITS.map(({ icon: Icon, title, description }, index) => (
              <article
                key={title}
                className={`py-8 sm:px-8 sm:py-10 ${index > 0 ? 'border-t border-border sm:border-t-0 sm:border-l' : ''}`}
              >
                <Icon aria-hidden="true" className="size-5 text-primary" />
                <h2 className="mt-4 text-base font-semibold">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
            <div>
              <Badge variant="secondary" className="rounded-full px-3 py-1">
                {release ? `Sürüm ${release.version}` : 'Hazırlanıyor'}
              </Badge>
              <h2 className="mt-5 text-3xl font-semibold tracking-[-0.035em] text-balance sm:text-4xl">
                Hızlı kurulum, aynı Öğün.
              </h2>
              <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground">
                Masaüstü uygulaması ayrı bir veri kopyası oluşturmaz. Aynı güvenli klinik alanına
                bağlanır; web ve masaüstü arasında geçiş yapabilirsiniz.
              </p>

              <div className="mt-8 rounded-2xl border border-amber-300/60 bg-amber-50 p-4 text-sm leading-6 text-amber-950 dark:border-amber-800 dark:bg-amber-950/35 dark:text-amber-100">
                <div className="flex gap-3">
                  <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
                  <p>
                    <strong>Beta notu:</strong> Windows kod imzalama sertifikası henüz eklenmediği
                    için ilk kurulumda yayıncı doğrulama uyarısı görebilirsiniz. Kurulum dosyası bu
                    projenin resmi GitHub release alanından HTTPS ile sunulur. Windows Defender
                    taramasında tehdit bulunmamıştır.
                  </p>
                </div>
                {windowsChecksums.length > 0 ? (
                  <div className="mt-3 border-t border-amber-300/50 pt-3 dark:border-amber-800">
                    <p className="text-xs font-semibold">Dosya bütünlüğü — SHA-256</p>
                    {windowsChecksums.map((asset) => (
                      <div key={asset.url} className="mt-2">
                        <p className="font-mono text-[0.68rem] leading-4 text-amber-900/80 dark:text-amber-200/80">
                          {asset.url.split('/').pop()}
                        </p>
                        <code className="block break-all font-mono text-[0.68rem] leading-5">
                          {asset.sha256?.toUpperCase()}
                        </code>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <article className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-7">
                <Laptop aria-hidden="true" className="size-6 text-primary" />
                <h3 className="mt-5 text-lg font-semibold">Sistem gereksinimleri</h3>
                <p className="mt-5 text-xs font-semibold tracking-[0.12em] text-foreground uppercase">
                  Windows
                </p>
                <ul className="mt-3 space-y-3 text-sm leading-6 text-muted-foreground">
                  {DESKTOP_SYSTEM_REQUIREMENTS.windows.map((requirement) => (
                    <li key={requirement} className="flex gap-2.5">
                      <Check aria-hidden="true" className="mt-1 size-4 shrink-0 text-primary" />
                      <span>{requirement}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-6 border-t border-border pt-5 text-xs font-semibold tracking-[0.12em] text-foreground uppercase">
                  macOS
                </p>
                <ul className="mt-3 space-y-3 text-sm leading-6 text-muted-foreground">
                  {DESKTOP_SYSTEM_REQUIREMENTS.macos.map((requirement) => (
                    <li key={requirement} className="flex gap-2.5">
                      <Check aria-hidden="true" className="mt-1 size-4 shrink-0 text-primary" />
                      <span>{requirement}</span>
                    </li>
                  ))}
                </ul>
              </article>

              <article className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-7">
                <Download aria-hidden="true" className="size-6 text-primary" />
                <h3 className="mt-5 text-lg font-semibold">3 adımda başlayın</h3>
                <ol className="mt-5 space-y-4">
                  {DESKTOP_INSTALL_STEPS.windows.slice(0, 3).map((step, index) => (
                    <li key={step} className="grid grid-cols-[1.75rem_1fr] gap-3 text-sm leading-6">
                      <span className="grid size-7 place-items-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
                        {index + 1}
                      </span>
                      <span className="text-muted-foreground">{step}</span>
                    </li>
                  ))}
                </ol>
              </article>
            </div>
          </div>

          {release && release.notes.length > 0 ? (
            <div className="mt-16 rounded-3xl border border-border bg-muted/30 p-6 sm:p-8">
              <div className="grid gap-8 md:grid-cols-[0.55fr_1.45fr]">
                <div>
                  <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">
                    Son sürüm
                  </p>
                  <h2 className="mt-3 text-2xl font-semibold tracking-[-0.025em]">
                    Öğün Desktop {release.version}
                  </h2>
                  {releaseDate ? (
                    <p className="mt-2 text-sm text-muted-foreground">{releaseDate}</p>
                  ) : null}
                </div>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {release.notes.map((note) => (
                    <li key={note} className="flex gap-2.5 text-sm leading-6">
                      <Check aria-hidden="true" className="mt-1 size-4 shrink-0 text-primary" />
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
        </section>

        <section className="border-t border-border bg-muted/25">
          <div className="mx-auto flex max-w-4xl flex-col items-center px-4 py-16 text-center sm:px-6 sm:py-20">
            <h2 className="text-3xl font-semibold tracking-[-0.035em] text-balance">
              Hesabınız her yerde sizinle.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
              Masaüstünü kurmadan önce web’de hesap oluşturabilir veya mevcut klinik hesabınızla
              doğrudan devam edebilirsiniz.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-12 rounded-xl px-5">
                <Link href="/kayit">
                  Klinik hesabı oluştur <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 rounded-xl px-5">
                <Link href="/giris">Giriş yap</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}

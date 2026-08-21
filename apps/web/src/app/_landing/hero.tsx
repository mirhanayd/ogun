import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Check, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getLatestDesktopRelease } from '@/lib/desktop-releases'
import { HERO } from './content'

const HERO_STATS = [
  { value: '15.402', label: 'Türkçeleştirilmiş besin' },
  { value: '763.590', label: 'Besin öğesi kaydı' },
  { value: '60', label: 'Hesaplanan besin öğesi' },
]

export function Hero() {
  const release = getLatestDesktopRelease()

  return (
    <section className="relative isolate overflow-hidden bg-[#0d2a20] text-white dark:bg-[#091d17]">
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 opacity-70 [background-image:radial-gradient(circle_at_18%_15%,rgba(86,197,151,0.24),transparent_31%),radial-gradient(circle_at_86%_76%,rgba(159,225,203,0.13),transparent_29%)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,.55)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.55)_1px,transparent_1px)] [background-size:72px_72px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]"
      />

      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 pt-16 pb-12 sm:px-6 sm:pt-24 sm:pb-16 lg:grid-cols-[minmax(0,0.82fr)_minmax(36rem,1.18fr)] lg:gap-14 lg:px-8 lg:pt-28 lg:pb-20">
        <div className="relative z-10 max-w-2xl">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.07] px-3 py-1.5 text-xs font-semibold tracking-[0.14em] text-emerald-100 uppercase backdrop-blur-sm">
            <span className="size-1.5 rounded-full bg-emerald-300 shadow-[0_0_0_4px_rgba(110,231,183,.12)]" />
            {HERO.eyebrow}
          </div>

          <h1 className="max-w-[13ch] text-[clamp(2.85rem,5.4vw,5.35rem)] leading-[0.98] font-semibold tracking-[-0.055em] text-balance">
            {HERO.headline}
          </h1>

          <p className="mt-7 max-w-xl text-[1.0625rem] leading-7 text-emerald-50/75 sm:text-lg sm:leading-8">
            {HERO.subhead}
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              asChild
              size="lg"
              className="h-12 rounded-xl bg-white px-5 text-[0.9375rem] text-[#123d2e] shadow-[0_12px_35px_rgba(0,0,0,.2)] hover:bg-emerald-50"
            >
              <Link href="/kayit">
                {HERO.primaryCta}
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-12 rounded-xl border-white/20 bg-white/[0.06] px-5 text-[0.9375rem] text-white hover:bg-white/[0.12] hover:text-white dark:border-white/20 dark:bg-white/[0.06] dark:hover:bg-white/[0.12]"
            >
              <a href="#urun">{HERO.secondaryCta}</a>
            </Button>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-emerald-50/65">
            <span className="inline-flex items-center gap-1.5">
              <Check aria-hidden="true" className="size-3.5 text-emerald-300" />
              Web ve masaüstünde aynı hesap
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Check aria-hidden="true" className="size-3.5 text-emerald-300" />
              Yönetici hesabıyla başlayın
            </span>
            <Link
              href="/indir"
              className="inline-flex items-center gap-1.5 rounded underline-offset-4 hover:text-white hover:underline"
            >
              <Download aria-hidden="true" className="size-3.5" />
              {release ? `Masaüstü ${release.version}` : 'Masaüstü uygulaması'}
            </Link>
          </div>
        </div>

        <div className="relative min-w-0 lg:-mr-52 xl:-mr-64">
          <div
            aria-hidden="true"
            className="absolute -inset-8 rounded-full bg-emerald-300/10 blur-3xl"
          />
          <figure className="relative overflow-hidden rounded-[1.6rem] border border-white/15 bg-white/[0.08] p-2 shadow-[0_35px_90px_rgba(0,0,0,.38)] backdrop-blur-sm sm:p-3">
            <div className="flex h-9 items-center gap-1.5 px-3" aria-hidden="true">
              <span className="size-2 rounded-full bg-white/25" />
              <span className="size-2 rounded-full bg-white/15" />
              <span className="size-2 rounded-full bg-emerald-300/60" />
              <span className="ml-3 h-4 w-32 rounded-full bg-white/[0.08]" />
            </div>
            <div className="relative aspect-[1.37/1] overflow-hidden rounded-[1.15rem] bg-[#f8fbf9] sm:aspect-[1.52/1] lg:aspect-[1.18/1] xl:aspect-[1.35/1]">
              <Image
                src="/marketing/plan-editor.png"
                alt="Öğün plan editörü ve canlı besin öğesi paneli"
                width={1440}
                height={900}
                priority
                sizes="(max-width: 1024px) 100vw, 850px"
                className="absolute inset-y-0 left-0 h-full w-auto max-w-none object-cover object-left-top"
              />
            </div>
          </figure>

          <div className="absolute -bottom-5 left-5 flex items-center gap-3 rounded-2xl border border-white/15 bg-[#173d30]/95 px-4 py-3 shadow-xl backdrop-blur md:left-8">
            <span className="grid size-9 place-items-center rounded-xl bg-emerald-300/15 text-emerald-200">
              <Check aria-hidden="true" className="size-4" />
            </span>
            <span>
              <span className="block text-xs font-semibold text-white">Canlı besin analizi</span>
              <span className="block text-[0.6875rem] text-emerald-50/60">
                Planla birlikte, aynı ekranda
              </span>
            </span>
          </div>
        </div>
      </div>

      <dl className="mx-auto grid max-w-7xl grid-cols-1 border-t border-white/10 px-4 sm:grid-cols-3 sm:px-6 lg:px-8">
        {HERO_STATS.map((stat, index) => (
          <div
            key={stat.label}
            className={`flex items-baseline gap-3 py-5 sm:px-7 sm:py-6 ${index > 0 ? 'border-t border-white/10 sm:border-t-0 sm:border-l' : ''} ${index === 0 ? 'sm:pl-0' : ''}`}
          >
            <dt className="order-2 text-xs font-medium tracking-wide text-emerald-50/55 uppercase">
              {stat.label}
            </dt>
            <dd className="text-xl font-semibold tracking-[-0.03em] text-white tabular-nums">
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

import Image from 'next/image'
import Link from 'next/link'
import { Activity, ArrowLeft, Database, ShieldCheck, UsersRound } from 'lucide-react'

const AUTH_BENEFITS = [
  { icon: Activity, label: 'Canlı besin analizi', detail: 'Planı yazarken hesaplayın' },
  { icon: UsersRound, label: 'Ekip çalışma alanı', detail: 'Yetkiye göre sade görünüm' },
  { icon: ShieldCheck, label: 'Klinik sınırları', detail: 'İzlenebilir veri erişimi' },
]

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-shell min-h-svh bg-background lg:grid lg:grid-cols-[minmax(22rem,0.78fr)_minmax(34rem,1.22fr)]">
      <aside className="auth-shell-aside relative hidden min-h-svh overflow-hidden bg-[#0e2b21] px-10 py-9 text-white lg:flex lg:flex-col xl:px-14 xl:py-11">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-80 [background-image:radial-gradient(circle_at_20%_15%,rgba(79,169,127,.24),transparent_34%),radial-gradient(circle_at_92%_85%,rgba(159,225,203,.12),transparent_30%)]"
        />
        <div
          aria-hidden="true"
          className="absolute -right-36 top-1/2 size-[30rem] -translate-y-1/2 rounded-full border border-white/[0.07]"
        />
        <div
          aria-hidden="true"
          className="absolute -right-20 top-1/2 size-[22rem] -translate-y-1/2 rounded-full border border-white/[0.07]"
        />

        <Link
          href="/"
          aria-label="Öğün ana sayfa"
          className="relative w-fit rounded-lg focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:outline-none"
        >
          <Image
            src="/brand/ogun-logo-koyu-zemin.svg"
            alt="Öğün"
            width={200}
            height={104}
            priority
            unoptimized
            className="h-10 w-auto"
          />
        </Link>

        <div className="auth-shell-copy relative my-auto max-w-lg py-14">
          <p className="text-xs font-semibold tracking-[0.16em] text-emerald-300 uppercase">
            Klinik çalışma alanınız
          </p>
          <h2 className="mt-5 max-w-[12ch] text-[clamp(2.4rem,4.2vw,4.5rem)] leading-[1.02] font-semibold tracking-[-0.055em] text-balance">
            Klinik akışı, sakin bir düzende.
          </h2>
          <p className="mt-6 max-w-md text-base leading-7 text-emerald-50/65">
            Danışan bilgisi, randevu ve beslenme planı aynı güvenli çalışma alanında; ekibiniz için
            doğru yetkiyle.
          </p>

          <ul className="auth-shell-benefits mt-10 grid gap-3 xl:grid-cols-3">
            {AUTH_BENEFITS.map(({ icon: Icon, label, detail }) => (
              <li
                key={label}
                className="rounded-2xl border border-white/10 bg-white/[0.055] p-4 backdrop-blur-sm"
              >
                <Icon aria-hidden="true" className="size-4 text-emerald-300" strokeWidth={1.8} />
                <p className="mt-4 text-xs font-semibold">{label}</p>
                <p className="mt-1 text-[0.6875rem] leading-4 text-emerald-50/50">{detail}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="auth-shell-dataset relative flex items-center gap-3 border-t border-white/10 pt-6 text-xs text-emerald-50/55">
          <Database aria-hidden="true" className="size-4 text-emerald-300" />
          <span>15.402 Türkçeleştirilmiş besin · 60 besin öğesi</span>
        </div>
      </aside>

      <main className="auth-shell-main relative flex min-h-svh flex-col bg-[radial-gradient(circle_at_80%_5%,color-mix(in_oklch,var(--accent)_42%,transparent),transparent_32%)]">
        <div className="auth-shell-header flex h-[4.5rem] items-center justify-between px-4 sm:px-8 lg:px-10 xl:px-14">
          <Link href="/" aria-label="Öğün ana sayfa" className="rounded-lg lg:hidden">
            <Image
              src="/brand/ogun-logo-yatay.svg"
              alt="Öğün"
              width={154}
              height={76}
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
          <Link
            href="/"
            className="ml-auto inline-flex items-center gap-2 rounded-lg px-2 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft aria-hidden="true" className="size-3.5" />
            Ana sayfa
          </Link>
        </div>

        <div className="auth-shell-form-area flex flex-1 items-center justify-center px-5 py-10 sm:px-8 lg:px-12 xl:px-20">
          <div className="w-full max-w-[30rem]">{children}</div>
        </div>

        <p className="auth-shell-legal px-5 pb-6 text-center text-[0.6875rem] leading-4 text-muted-foreground sm:px-8">
          Devam ederek kurumunuzun veri sorumluluğu ilkelerine uygun hareket etmeyi kabul edersiniz.
        </p>
      </main>
    </div>
  )
}

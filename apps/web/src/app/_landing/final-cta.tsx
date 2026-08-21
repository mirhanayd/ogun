import Link from 'next/link'
import { ArrowRight, LogIn } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function FinalCta() {
  return (
    <section
      aria-labelledby="son-cta-baslik"
      className="bg-background px-4 pb-20 sm:px-6 sm:pb-28 lg:px-8"
    >
      <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-[#153d2f] px-6 py-14 text-white shadow-[0_30px_80px_-40px_rgba(15,61,45,.7)] sm:px-10 sm:py-16 lg:px-16">
        <div
          aria-hidden="true"
          className="absolute -top-36 -right-24 size-96 rounded-full border border-emerald-200/10"
        />
        <div
          aria-hidden="true"
          className="absolute -top-16 -right-4 size-64 rounded-full border border-emerald-200/10"
        />
        <div className="relative grid items-end gap-8 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold tracking-[0.16em] text-emerald-300 uppercase">
              Başlamaya hazır
            </p>
            <h2
              id="son-cta-baslik"
              className="mt-4 text-[clamp(2rem,4.4vw,4rem)] leading-[1.04] font-semibold tracking-[-0.05em] text-balance"
            >
              Kliniğinizin yeni çalışma alanını kurun.
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-7 text-emerald-50/65">
              Yönetici hesabınızı oluşturun, klinik bilgilerinizi tamamlayın ve ekibinizi kendi
              çalışma alanına davet edin.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
            <Button
              asChild
              size="lg"
              className="h-12 rounded-xl bg-white px-5 text-[#123d2e] hover:bg-emerald-50"
            >
              <Link href="/kayit">
                Yönetici hesabı oluştur
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-12 rounded-xl border-white/20 bg-transparent px-5 text-white hover:bg-white/10 hover:text-white dark:border-white/20 dark:bg-transparent dark:hover:bg-white/10"
            >
              <Link href="/giris">
                <LogIn aria-hidden="true" />
                Giriş yap
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}

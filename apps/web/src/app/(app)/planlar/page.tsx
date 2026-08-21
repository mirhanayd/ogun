import Link from 'next/link'
import {
  ArrowRight,
  BookOpenText,
  Check,
  ClipboardList,
  Layers3,
  Sparkles,
  UserRoundSearch,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

const workflow = [
  {
    step: '01',
    title: 'Danışanı seçin',
    description: 'Profil, anamnez ve güncel ölçümleri birlikte değerlendirin.',
  },
  {
    step: '02',
    title: 'Planı oluşturun',
    description: 'Boş başlayın, önceki planı kopyalayın veya şablondan ilerleyin.',
  },
  {
    step: '03',
    title: 'Paylaşın',
    description: 'Planı PDF olarak indirin ya da danışana güvenli bağlantıyla iletin.',
  },
]

export default function PlanlarPage() {
  return (
    <div className="flex flex-col gap-7 pb-8">
      <section className="flex flex-col gap-5 border-b border-border/70 pb-7 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-primary uppercase">
            <ClipboardList className="size-3.5" />
            Beslenme programları
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">Plan merkezi</h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            Kliniğinizin plan üretme standardını koruyun; danışan verilerinden başlayıp
            paylaşılabilir bir programa ilerleyin.
          </p>
        </div>
        <Button asChild size="lg" className="w-fit rounded-xl px-4 shadow-sm shadow-primary/15">
          <Link href="/danisanlar">
            <UserRoundSearch data-icon="inline-start" />
            Danışan seçerek başla
          </Link>
        </Button>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <Link
          href="/planlar/sablonlar"
          className="group rounded-xl focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Card className="relative h-full min-h-80 overflow-hidden border-primary/20 bg-primary text-primary-foreground shadow-xl shadow-primary/10 transition-transform duration-200 group-hover:-translate-y-0.5">
            <CardContent className="relative flex h-full flex-col p-7 sm:p-8">
              <div className="pointer-events-none absolute -top-28 -right-24 size-72 rounded-full bg-primary-foreground/8 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-32 -left-20 size-64 rounded-full bg-black/8 blur-3xl" />
              <div className="relative flex items-center justify-between">
                <span className="flex size-11 items-center justify-center rounded-2xl bg-primary-foreground/12 ring-1 ring-primary-foreground/15">
                  <Layers3 className="size-5" />
                </span>
                <Badge className="border-primary-foreground/15 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/10">
                  Klinik kütüphanesi
                </Badge>
              </div>
              <div className="relative mt-auto max-w-xl pt-16">
                <p className="text-xs font-semibold tracking-[0.14em] text-primary-foreground/60 uppercase">
                  Hızlı ve tutarlı
                </p>
                <h2 className="mt-3 text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
                  Plan şablonları
                </h2>
                <p className="mt-3 max-w-lg text-sm leading-6 text-primary-foreground/70 sm:text-base">
                  Sık kullandığınız yaklaşımları yeniden kurmak yerine kategorilere ayrılmış klinik
                  şablonlarından güvenle başlayın.
                </p>
                <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold">
                  Kütüphaneyi aç
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </span>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Card className="h-full border-border/70 bg-card/90 shadow-sm shadow-foreground/[0.03]">
          <CardContent className="flex h-full flex-col p-6 sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-accent text-accent-foreground ring-1 ring-primary/10">
                <BookOpenText className="size-5" />
              </span>
              <Sparkles className="size-4 text-primary/60" />
            </div>
            <h2 className="mt-7 text-xl font-semibold tracking-[-0.02em]">Danışana özel plan</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Her plan bir danışan profiline bağlıdır; böylece hedefler, anamnez ve ölçümler aynı
              klinik bağlamında kalır.
            </p>
            <ul className="mt-6 space-y-3 text-sm">
              {[
                'Önceki planı tek adımda kopyalama',
                'Öğün ve değişim bazlı düzenleme',
                'Besin öğelerini anlık karşılaştırma',
              ].map((item) => (
                <li key={item} className="flex items-center gap-2.5">
                  <span className="grid size-5 place-items-center rounded-full bg-primary/10 text-primary">
                    <Check className="size-3" strokeWidth={2.5} />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <Button asChild variant="outline" className="mt-auto w-full rounded-xl py-5">
              <Link href="/danisanlar">
                Danışanlara git
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="rounded-2xl border border-border/70 bg-background/55 p-5 sm:p-6">
        <div className="mb-5">
          <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            Standart iş akışı
          </p>
          <h2 className="mt-1.5 text-lg font-semibold tracking-tight">Üç adımda danışana hazır</h2>
        </div>
        <ol className="grid gap-3 md:grid-cols-3">
          {workflow.map((item) => (
            <li key={item.step} className="rounded-xl border border-border/65 bg-card/75 p-4">
              <span className="text-xs font-semibold tracking-[0.1em] text-primary">
                {item.step}
              </span>
              <h3 className="mt-5 text-sm font-semibold">{item.title}</h3>
              <p className="mt-1.5 text-sm leading-5 text-muted-foreground">{item.description}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}

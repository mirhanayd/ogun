import { ArrowUpRight, CircleCheck, Info } from 'lucide-react'
import { DATA_SOURCES, NUTRIENT_FIELD_COUNT, SOURCE_CAVEATS, TOTAL_FOOD_COUNT } from './content'

export function SourceTransparency() {
  return (
    <section
      id="kaynaklar"
      aria-labelledby="kaynaklar-baslik"
      className="relative overflow-hidden bg-[#10261f] text-white dark:bg-[#0a1d17]"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-50 [background-image:radial-gradient(circle_at_85%_5%,rgba(79,169,127,.2),transparent_34%)]"
      />
      <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.7fr)_minmax(24rem,0.3fr)] lg:items-end">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold tracking-[0.16em] text-emerald-300 uppercase">
              Kaynak şeffaflığı
            </p>
            <h2
              id="kaynaklar-baslik"
              className="mt-4 text-[clamp(2rem,4.6vw,4.3rem)] leading-[1.02] font-semibold tracking-[-0.05em] text-balance"
            >
              Bir sayı klinik karara dönüşüyorsa, kaynağı görünür olmalı.
            </h2>
          </div>
          <p className="text-base leading-7 text-emerald-50/65">
            Öğün her besin kaydını kaynağına, atfına ve lisansına bağlar. Hesaplamanın arkasındaki
            veri bir dipnot değil, ürünün denetlenebilir parçasıdır.
          </p>
        </div>

        <dl className="mt-14 grid border-y border-white/15 sm:grid-cols-3">
          <div className="py-6 sm:pr-8">
            <dt className="text-xs font-medium tracking-[0.12em] text-emerald-50/50 uppercase">
              Türkçeleştirilmiş besin
            </dt>
            <dd className="mt-2 text-4xl font-semibold tracking-[-0.04em] tabular-nums">
              {TOTAL_FOOD_COUNT.toLocaleString('tr-TR')}
            </dd>
          </div>
          <div className="border-t border-white/15 py-6 sm:border-t-0 sm:border-l sm:px-8">
            <dt className="text-xs font-medium tracking-[0.12em] text-emerald-50/50 uppercase">
              Besin öğesi alanı
            </dt>
            <dd className="mt-2 text-4xl font-semibold tracking-[-0.04em] tabular-nums">
              {NUTRIENT_FIELD_COUNT}
            </dd>
          </div>
          <div className="border-t border-white/15 py-6 sm:border-t-0 sm:border-l sm:pl-8">
            <dt className="text-xs font-medium tracking-[0.12em] text-emerald-50/50 uppercase">
              Bilimsel veri tabanı
            </dt>
            <dd className="mt-2 text-4xl font-semibold tracking-[-0.04em] tabular-nums">
              {DATA_SOURCES.length}
            </dd>
          </div>
        </dl>

        <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-white/15 bg-white/15 lg:grid-cols-2">
          {DATA_SOURCES.map((source) => (
            <article
              key={source.code}
              className="flex flex-col bg-[#10261f]/95 p-6 sm:p-8 dark:bg-[#0a1d17]/95"
            >
              <div className="flex items-center justify-between gap-4">
                <p className="text-xs font-semibold tracking-[0.16em] text-emerald-300 uppercase">
                  {source.code}
                </p>
                <span className="rounded-full border border-white/15 px-2.5 py-1 text-[0.625rem] font-medium text-emerald-50/65">
                  {source.license}
                </span>
              </div>
              <h3 className="mt-6 text-xl font-semibold tracking-[-0.025em]">{source.name}</h3>
              <p className="mt-2 text-sm leading-6 text-emerald-50/60">{source.scope}</p>
              <p className="mt-7 text-sm text-emerald-50/75">
                <strong className="text-2xl font-semibold text-white tabular-nums">
                  {source.foodCount.toLocaleString('tr-TR')}
                </strong>{' '}
                kayıt
              </p>
              <blockquote className="mt-6 border-l border-emerald-300/30 pl-4 text-xs leading-5 text-emerald-50/50">
                {source.citation}
              </blockquote>
              <div className="mt-7 flex flex-wrap gap-5">
                <a
                  href={source.homepageUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 rounded text-sm font-medium text-emerald-200 underline-offset-4 hover:underline"
                >
                  Kaynağı incele <ArrowUpRight aria-hidden="true" className="size-3.5" />
                </a>
                {source.licenseUrl ? (
                  <a
                    href={source.licenseUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1.5 rounded text-sm font-medium text-emerald-200 underline-offset-4 hover:underline"
                  >
                    Lisans metni <ArrowUpRight aria-hidden="true" className="size-3.5" />
                  </a>
                ) : null}
              </div>
            </article>
          ))}
        </div>

        <div className="mt-8 grid gap-5 rounded-2xl border border-white/15 bg-white/[0.05] p-6 sm:p-8 lg:grid-cols-[14rem_minmax(0,1fr)]">
          <div>
            <Info aria-hidden="true" className="size-5 text-emerald-300" />
            <h3 className="mt-3 font-semibold">Açık çalışma notları</h3>
            <p className="mt-2 text-xs leading-5 text-emerald-50/50">
              Tamamlanan ve değerlendirmeye açık kalan veri işleri.
            </p>
          </div>
          <ul className="grid gap-3">
            {SOURCE_CAVEATS.map((caveat) => (
              <li key={caveat} className="flex gap-3 text-sm leading-6 text-emerald-50/70">
                <CircleCheck aria-hidden="true" className="mt-1 size-4 shrink-0 text-emerald-300" />
                <span>{caveat}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

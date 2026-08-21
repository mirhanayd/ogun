import { ArrowDownRight, Check, ShieldCheck, Sparkles, UsersRound } from 'lucide-react'
import { VALUE_SECTIONS } from './content'

const ICONS = [Sparkles, UsersRound, ShieldCheck]

export function ValueSections() {
  return (
    <section
      id="neden-ogun"
      aria-labelledby="neden-ogun-baslik"
      className="border-y border-border/70 bg-muted/35"
    >
      <div className="mx-auto grid max-w-7xl gap-14 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-[minmax(15rem,0.36fr)_minmax(0,0.64fr)] lg:gap-20 lg:px-8">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">
            Neden Öğün
          </p>
          <h2
            id="neden-ogun-baslik"
            className="mt-4 text-[clamp(2rem,3.5vw,3.25rem)] leading-[1.06] font-semibold tracking-[-0.045em] text-balance"
          >
            Kliniğiniz büyürken iş yükünüz büyümek zorunda değil.
          </h2>
          <p className="mt-5 max-w-md text-base leading-7 text-muted-foreground">
            Öğün, plan hazırlamayı kliniğin geri kalanından ayırmaz. Hesaplama, danışan takibi ve
            ekip düzeni aynı çalışma modelinin parçalarıdır.
          </p>
          <ArrowDownRight
            aria-hidden="true"
            className="mt-8 hidden size-7 text-primary/60 lg:block"
            strokeWidth={1.5}
          />
        </div>

        <div>
          {VALUE_SECTIONS.map((section, index) => {
            const Icon = ICONS[index] ?? Sparkles
            return (
              <article
                key={section.id}
                id={section.id}
                className="border-t border-border py-10 first:pt-0 lg:py-14 lg:first:pt-0"
              >
                <div className="grid gap-7 sm:grid-cols-[5.25rem_minmax(0,1fr)]">
                  <div className="flex items-center gap-3 sm:flex-col sm:items-start">
                    <span className="text-xs font-semibold tracking-[0.18em] text-muted-foreground">
                      {section.number}
                    </span>
                    <span className="grid size-10 place-items-center rounded-xl border border-primary/15 bg-primary/[0.07] text-primary">
                      <Icon aria-hidden="true" className="size-4.5" strokeWidth={1.7} />
                    </span>
                  </div>

                  <div>
                    <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">
                      {section.kicker}
                    </p>
                    <h3 className="mt-3 max-w-2xl text-2xl leading-tight font-semibold tracking-[-0.035em] text-balance sm:text-3xl">
                      {section.title}
                    </h3>
                    <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
                      {section.body}
                    </p>

                    <ul className="mt-7 grid gap-x-8 gap-y-3 sm:grid-cols-2">
                      {section.points.map((point) => (
                        <li key={point} className="flex gap-2.5 text-sm leading-6">
                          <Check
                            aria-hidden="true"
                            className="mt-1 size-3.5 shrink-0 text-primary"
                            strokeWidth={2.2}
                          />
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}

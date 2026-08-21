import { ChevronDown, MessageCircleQuestion } from 'lucide-react'
import { FAQ_ITEMS } from './content'

export function Faq() {
  return (
    <section id="sss" aria-labelledby="sss-baslik" className="bg-background">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-[minmax(16rem,0.34fr)_minmax(0,0.66fr)] lg:gap-20 lg:px-8">
        <div>
          <span className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">
            <MessageCircleQuestion aria-hidden="true" className="size-5" strokeWidth={1.8} />
          </span>
          <p className="mt-7 text-xs font-semibold tracking-[0.16em] text-primary uppercase">
            Merak edilenler
          </p>
          <h2
            id="sss-baslik"
            className="mt-3 text-[clamp(2rem,3.3vw,3.2rem)] leading-[1.06] font-semibold tracking-[-0.045em]"
          >
            Kısa ve açık cevaplar.
          </h2>
          <p className="mt-4 max-w-sm text-sm leading-6 text-muted-foreground">
            Hesap yapısı, veri kaynakları ve danışanla paylaşım hakkında en sık gelen sorular.
          </p>
        </div>

        <div className="border-t border-border">
          {FAQ_ITEMS.map((item) => (
            <details key={item.question} name="sss" className="group border-b border-border">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-5 py-5 text-base font-semibold marker:content-none sm:py-6 sm:text-lg">
                <span>{item.question}</span>
                <span className="grid size-8 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition-colors group-open:border-primary/20 group-open:bg-primary/10 group-open:text-primary">
                  <ChevronDown
                    aria-hidden="true"
                    className="size-4 transition-transform duration-200 group-open:rotate-180"
                  />
                </span>
              </summary>
              <p className="max-w-2xl pb-6 pr-10 text-sm leading-7 text-muted-foreground sm:text-base">
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

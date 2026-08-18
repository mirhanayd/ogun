import { Check } from 'lucide-react'
import { VALUE_SECTIONS } from './content'

// GitHub issue #60 / Faz 10, Prompt 10.2, GÖREV 1 — "Üç değer bölümü:
// (1) besin bileşim motoru, (2) hız, (3) KVKK/yerli barındırma".
//
// Bölümler dönüşümlü hizalanıyor (tek/çift) — üç aynı kartlık bir ızgara
// yerine tam genişlikte, sırayla okunan bir anlatı: sıra ÖNEMLİ, çünkü
// birinci bölüm rakip farkını kuruyor, ikincisi onu hızla, üçüncüsü
// sorumlulukla tamamlıyor.
export function ValueSections() {
  return (
    <section id="neden-ogun" aria-labelledby="neden-ogun-baslik" className="border-b border-border/70">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <h2 id="neden-ogun-baslik" className="sr-only">
          Neden Öğün
        </h2>

        <div className="flex flex-col gap-14 sm:gap-20">
          {VALUE_SECTIONS.map((section, index) => (
            <article
              key={section.id}
              id={section.id}
              className="grid items-start gap-6 sm:grid-cols-2 sm:gap-12"
            >
              <div className={index % 2 === 1 ? 'sm:order-2' : undefined}>
                <p className="text-helper font-medium tracking-wide text-primary uppercase">{section.kicker}</p>
                <h3 className="mt-2 text-title text-balance">{section.title}</h3>
                <p className="mt-3 text-lead text-muted-foreground">{section.body}</p>
              </div>

              <ul className={`flex flex-col gap-3 ${index % 2 === 1 ? 'sm:order-1' : ''}`}>
                {section.points.map((point) => (
                  <li key={point} className="flex gap-3 rounded-lg bg-muted/60 p-4">
                    <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span className="text-body">{point}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

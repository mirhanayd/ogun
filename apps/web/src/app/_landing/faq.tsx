import { ChevronDown } from 'lucide-react'
import { FAQ_ITEMS } from './content'

// GitHub issue #60 / Faz 10, Prompt 10.2, GÖREV 1 — SSS.
//
// NATIVE <details>/<summary>, shadcn Accordion DEĞİL: Accordion bir Radix
// istemci bileşenidir (JS demeti + hidrasyon). Native öğe aynı davranışı
// SIFIR JavaScript ile verir, klavye ve ekran okuyucu desteği tarayıcıdan
// gelir (Lighthouse erişilebilirlik 100 hedefi), JS kapalıyken bile açılır
// ve tarayıcının sayfa içi arama özelliği kapalı içerikte de bulur. Bir
// pazarlama sayfası için doğru takas — uygulama içindeki etkileşimli
// yüzeylerde Accordion tercihi DEĞİŞMEDİ.
export function Faq() {
  return (
    <section id="sss" aria-labelledby="sss-baslik" className="border-b border-border/70">
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
        <h2 id="sss-baslik" className="text-title">
          Sık sorulan sorular
        </h2>

        <div className="mt-6 flex flex-col gap-3">
          {FAQ_ITEMS.map((item) => (
            <details
              key={item.question}
              name="sss"
              className="group rounded-xl border border-border bg-card px-5 open:bg-card"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-section marker:content-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
                {item.question}
                <ChevronDown
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                />
              </summary>
              <p className="pb-5 text-body text-muted-foreground">{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

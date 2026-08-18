import { ExternalLink, Info } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { DATA_SOURCES, NUTRIENT_FIELD_COUNT, SOURCE_CAVEATS, TOTAL_FOOD_COUNT } from './content'

// GitHub issue #60 / Faz 10, Prompt 10.2, GÖREV 1 — "Kaynak şeffaflığı
// bölümü: BLS 4.0 + USDA FDC, atıf ve lisans bilgisiyle. Bu bölüm
// rakiplerin veremediği güveni verir, ÖNE ÇIKAR."
//
// "Öne çıkar" burada düz bir vurgu sınıfı değil, YERLEŞİM kararı: bölüm
// sayfanın tam genişliğini kullanan, kendi zemin rengi olan tek bölüm ve
// üç değer bölümünün HEMEN ARDINDAN geliyor — yani ürün iddiası
// kurulduktan sonra, fiyatlandırma sorulmadan ÖNCE. Atıf metinleri
// küçük punto bir dipnot DEĞİL, kartın içinde tam olarak yazılı: bir
// diyetisyen değerin nereden geldiğini kopyalayıp yayınına koyabilmeli.
export function SourceTransparency() {
  return (
    <section id="kaynaklar" aria-labelledby="kaynaklar-baslik" className="border-b border-border/70 bg-muted/40">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="max-w-3xl">
          <p className="text-helper font-medium tracking-wide text-primary uppercase">Kaynak şeffaflığı</p>
          <h2 id="kaynaklar-baslik" className="mt-2 text-title text-balance">
            Hangi sayının nereden geldiğini söyleyebiliyoruz
          </h2>
          <p className="mt-3 text-lead text-muted-foreground">
            Bir diyet listesinin arkasındaki besin öğesi değerleri bir yerden gelmek zorundadır. Öğün bunu
            gizlemez: her besin kaydı bir kaynağa, atıfa ve lisansa bağlıdır. Kaynağını söyleyemeyen bir
            hesaplama, klinik bir karara dayanak olamaz.
          </p>
        </div>

        <dl className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-5">
            <dt className="text-helper text-muted-foreground">Besin kaydı</dt>
            <dd className="text-data-lg mt-1">{TOTAL_FOOD_COUNT.toLocaleString('tr-TR')}</dd>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <dt className="text-helper text-muted-foreground">Besin öğesi alanı</dt>
            <dd className="text-data-lg mt-1">{NUTRIENT_FIELD_COUNT}</dd>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <dt className="text-helper text-muted-foreground">Birincil veri tabanı</dt>
            <dd className="text-data-lg mt-1">{DATA_SOURCES.length}</dd>
          </div>
        </dl>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {DATA_SOURCES.map((source) => (
            <article key={source.code} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-section">{source.code}</h3>
                <Badge variant="secondary">{source.license}</Badge>
              </div>

              <div>
                <p className="text-body font-medium">{source.name}</p>
                <p className="text-body text-muted-foreground">{source.scope}</p>
              </div>

              <p className="text-body">
                <span className="text-data font-medium">{source.foodCount.toLocaleString('tr-TR')}</span>{' '}
                <span className="text-muted-foreground">besin kaydı bu kaynaktan geliyor.</span>
              </p>

              <div className="rounded-lg bg-muted/70 p-4">
                <p className="text-helper font-medium tracking-wide text-muted-foreground uppercase">Atıf</p>
                <p className="mt-1.5 text-body">{source.citation}</p>
              </div>

              <div className="mt-auto flex flex-wrap gap-4">
                <a
                  href={source.homepageUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 rounded-md text-body text-primary underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  Kaynağın sitesi
                  <ExternalLink aria-hidden="true" className="size-3.5" />
                </a>
                {source.licenseUrl && (
                  <a
                    href={source.licenseUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1.5 rounded-md text-body text-primary underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    {source.license} lisans metni
                    <ExternalLink aria-hidden="true" className="size-3.5" />
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>

        <div className="mt-6 rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-2">
            <Info aria-hidden="true" className="size-4 text-primary" />
            <h3 className="text-section">Henüz tamamlanmamış olanlar</h3>
          </div>
          <ul className="mt-3 flex flex-col gap-2">
            {SOURCE_CAVEATS.map((caveat) => (
              <li key={caveat} className="text-body text-muted-foreground before:mr-2 before:content-['—']">
                {caveat}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

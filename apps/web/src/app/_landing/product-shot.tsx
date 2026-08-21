import { existsSync } from 'node:fs'
import path from 'node:path'
import Image from 'next/image'
import { Activity, Database, TriangleAlert, WandSparkles } from 'lucide-react'

const SHOT = {
  src: '/marketing/plan-editor.png',
  width: 1440,
  height: 900,
  alt: 'Öğün plan editörü: öğün blokları, besin kalemleri ve canlı besin öğesi paneli.',
}

function shotExists(): boolean {
  return existsSync(path.join(process.cwd(), 'public', SHOT.src.replace(/^\//, '')))
}

const HIGHLIGHTS = [
  { icon: Activity, label: 'Anlık hesaplama', detail: 'Plan değiştikçe panel de değişir' },
  { icon: Database, label: 'Kaynaklı kayıt', detail: 'Her besin gerçek veriye bağlıdır' },
  { icon: WandSparkles, label: 'Akıcı editör', detail: 'Planlama ritminizi bölmez' },
]

export function ProductShot() {
  const available = shotExists()

  return (
    <section
      id="urun"
      aria-labelledby="urun-gorseli-baslik"
      className="relative overflow-hidden bg-background"
    >
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
        <div className="grid items-end gap-8 lg:grid-cols-[minmax(0,0.72fr)_minmax(32rem,1.28fr)] lg:gap-16">
          <div className="max-w-xl">
            <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">
              Plan editörü
            </p>
            <h2
              id="urun-gorseli-baslik"
              className="mt-4 text-[clamp(2rem,3.6vw,3.5rem)] leading-[1.05] font-semibold tracking-[-0.045em] text-balance"
            >
              Klinik karar, planın yanında görünür.
            </h2>
            <p className="mt-5 text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
              Ayrı bir hesap ekranına geçmeden hedef kaloriyi, makro dağılımını ve mikro besin
              yeterliliğini izleyin. Plan hazır olduğunda çıktı da hazırdır.
            </p>
          </div>

          <ul className="grid gap-3 sm:grid-cols-3">
            {HIGHLIGHTS.map(({ icon: Icon, label, detail }) => (
              <li key={label} className="border-l border-border pl-4">
                <Icon aria-hidden="true" className="mb-3 size-4 text-primary" strokeWidth={1.8} />
                <p className="text-sm font-semibold">{label}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
              </li>
            ))}
          </ul>
        </div>

        {available ? (
          <figure className="mt-12">
            <div className="overflow-hidden rounded-[1.5rem] border border-border/80 bg-card p-1.5 shadow-[0_28px_80px_-36px_rgba(9,45,32,.38)] sm:rounded-[2rem] sm:p-2.5 dark:shadow-black/40">
              <div
                className="flex h-9 items-center gap-1.5 px-3 sm:h-11 sm:px-4"
                aria-hidden="true"
              >
                <span className="size-2 rounded-full bg-border sm:size-2.5" />
                <span className="size-2 rounded-full bg-border sm:size-2.5" />
                <span className="size-2 rounded-full bg-primary/45 sm:size-2.5" />
                <span className="ml-3 text-[0.625rem] font-medium tracking-wide text-muted-foreground uppercase">
                  Öğün · Klinik çalışma alanı
                </span>
              </div>
              <div className="overflow-hidden rounded-[1.1rem] border border-border/70 bg-muted sm:rounded-[1.45rem]">
                <Image
                  src={SHOT.src}
                  alt={SHOT.alt}
                  width={SHOT.width}
                  height={SHOT.height}
                  sizes="(max-width: 1280px) 100vw, 1280px"
                  className="h-auto w-full"
                />
              </div>
            </div>
            <figcaption className="mx-auto mt-4 max-w-3xl text-center text-xs leading-5 text-muted-foreground">
              Demo klinik verisiyle alınmış gerçek ürün ekranı. Temsilî arayüz veya düzenlenmiş ürün
              görseli değildir.
            </figcaption>
          </figure>
        ) : (
          <div className="mt-12 flex flex-col gap-2 rounded-2xl border border-dashed border-border bg-muted/40 p-8">
            <div className="flex items-center gap-2">
              <TriangleAlert aria-hidden="true" className="size-4 text-muted-foreground" />
              <p className="font-semibold">Ürün görseli bu ortamda bulunamadı</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Temsilî bir arayüz göstermek yerine gerçek uygulama ekranı için ayrılan alan
              korunuyor.
            </p>
          </div>
        )}
      </div>
    </section>
  )
}

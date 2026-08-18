import { existsSync } from 'node:fs'
import path from 'node:path'
import Image from 'next/image'
import { TriangleAlert } from 'lucide-react'

// GitHub issue #60 / Faz 10, Prompt 10.2, GÖREV 1 — "Ürün görseli: plan
// editörünün GERÇEK ekran görüntüsü. UYDURMA GÖRSEL KULLANMA — demo seed
// verisiyle (pnpm db:seed:demo) gerçek ekranın görüntüsünü al,
// public/marketing/ altına koy."
//
// GÖRSEL NASIL ÜRETİLİR (tekrar üretilebilir olsun diye burada yazılı):
//   1. docker compose up -d postgres
//   2. pnpm --filter @ogun/db db:push && pnpm --filter @ogun/db db:seed
//   3. pnpm --filter @ogun/db db:seed:demo   → 25 danışan, 10 plan, 53 randevu
//   4. pnpm --filter web exec next build && pnpm --filter web exec next start -p 3100
//      (NEXT_PUBLIC_BETTER_AUTH_URL build sırasında GÖMÜLÜR — sunucuyu
//      build'e gömülen PORTLA çalıştırın, yoksa giriş sessizce asılı kalır.)
//   5. pnpm --filter @ogun/e2e capture:plan-editor
//      (apps/e2e/scripts/capture-plan-editor.ts — Playwright orada kurulu)
// Script gerçek bir tarayıcıyla giriş yapar, demo kliniğinin GERÇEK bir
// planını açar ve ekranı public/marketing/ altına yazar. Sahte bir mockup
// ÜRETMEZ; başarısız olursa hata verir ve dosya oluşmaz.
//
// DOSYA YOKSA UYDURMA GÖRSEL BASILMAZ: aşağıdaki `existsSync` kontrolü, görsel
// üretilemediğinde AÇIKÇA işaretlenmiş bir boşluk gösterir. Bu bilinçli —
// pilot diyetisyenlere gösterilen sahte bir ürün görseli, eksik bir
// görselden çok daha pahalıya mal olur.
const SHOT = {
  src: '/marketing/plan-editor.png',
  // Gerçek yakalama çözünürlüğü (bkz. capture-plan-editor.mjs viewport).
  width: 1440,
  height: 900,
  alt: 'Öğün plan editörü: solda öğün blokları ve besin kalemleri, sağda canlı besin öğesi paneli — demo seed verisiyle alınmış gerçek ekran görüntüsü.',
}

function shotExists(): boolean {
  // process.cwd() = apps/web (next build/start bu dizinden çalışır).
  return existsSync(path.join(process.cwd(), 'public', SHOT.src.replace(/^\//, '')))
}

export function ProductShot() {
  const available = shotExists()

  return (
    <section aria-labelledby="urun-gorseli-baslik" className="border-b border-border/70 bg-muted/40">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <h2 id="urun-gorseli-baslik" className="sr-only">
          Plan editörü
        </h2>

        {available ? (
          <figure className="flex flex-col gap-3">
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <Image
                src={SHOT.src}
                alt={SHOT.alt}
                width={SHOT.width}
                height={SHOT.height}
                sizes="(max-width: 1152px) 100vw, 1152px"
                // `priority` (preload) BİLEREK YOK: görsel kahraman
                // bölümünün ALTINDA kalıyor, yani ilk ekranda değil.
                // Preload etmek onu kritik yolun önüne koyup LCP'yi
                // kötüleştiriyordu (ölçüldü, bkz. docs/performance.md).
                className="h-auto w-full"
              />
            </div>
            <figcaption className="text-helper text-muted-foreground">
              Plan editörünün gerçek ekran görüntüsü — demo klinik verisiyle alındı, üzerinde hiçbir düzenleme
              yapılmadı. Sağdaki panel siz kalem eklerken enerji, makro ve mikro besin öğesi yeterliliğini
              yeniden hesaplar. Besin adları, kaynak veri tabanlarındaki (BLS 4.0 / USDA FDC) hâliyle görünüyor;
              Türkçeleştirme pilot süresince yapılıyor.
            </figcaption>
          </figure>
        ) : (
          <div className="flex flex-col gap-2 rounded-xl border border-dashed border-border bg-card p-8">
            <div className="flex items-center gap-2">
              <TriangleAlert aria-hidden="true" className="size-4 text-muted-foreground" />
              <p className="text-section">Ürün görseli burada yer alacak</p>
            </div>
            <p className="text-body text-muted-foreground">
              Plan editörünün gerçek ekran görüntüsü (public/marketing/plan-editor.png) bu ortamda
              üretilemedi. Temsilî ya da uydurma bir görsel BİLEREK konulmadı — üretim adımları bu bileşenin
              dosya başındaki notta yazılıdır.
            </p>
          </div>
        )}
      </div>
    </section>
  )
}

import Image from 'next/image'
import Link from 'next/link'
import { DATA_SOURCES } from './content'

// GitHub issue #60 / Faz 10, Prompt 10.2, GÖREV 1 — "alt bilgi (KVKK
// metinleri için YER TUT)".
//
// "YER TUT" harfiyen uygulandı: KVKK aydınlatma metni, açık rıza metni,
// çerez politikası ve kullanım koşulları HENÜZ YAZILMADI (yol haritasının
// kod DIŞI kalemleri — bkz. faz-10-ui-cilasi.md "Sonrasında" bölümü: "KVKK
// metinleri + VERBİS kaydı"). Bu yüzden burada HİÇBİR YERE GİTMEYEN bağlantı
// yok: metinler hazır olmadığı AÇIKÇA yazılıyor. Ölü bir `/kvkk` bağlantısı
// ya da "yakında" diye açılan boş bir sayfa, bir veri sorumlusu için
// yazılmamış metinden DAHA KÖTÜ bir sinyal olurdu.
//
// Metinler yazıldığında yapılacak: LEGAL_PLACEHOLDERS dizisini `href` alan
// gerçek bağlantılara çevir, aşağıdaki uyarı paragrafını kaldır.
const LEGAL_PLACEHOLDERS = [
  'KVKK aydınlatma metni',
  'Açık rıza metni',
  'Çerez politikası',
  'Kullanım koşulları',
]

const PRODUCT_LINKS = [
  { href: '/indir', label: 'Uygulamayı indir' },
  { href: '/kayit', label: 'Hesap oluştur' },
  { href: '/giris', label: 'Giriş yap' },
]

export function SiteFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="bg-background">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-3">
            <Image
              src="/brand/ogun-logo-yatay.svg"
              alt="Öğün"
              width={154}
              height={76}
              unoptimized
              className="h-8 w-auto dark:hidden"
            />
            <Image
              src="/brand/ogun-logo-koyu-zemin.svg"
              alt="Öğün"
              width={200}
              height={104}
              unoptimized
              className="hidden h-8 w-auto dark:block"
            />
            <p className="text-body text-muted-foreground">
              Klinik diyetisyenler için besin bileşim motoru ve masaüstü klinik yönetimi. Türkiye ve KKTC.
            </p>
          </div>

          <nav aria-labelledby="footer-urun" className="flex flex-col gap-3">
            <h2 id="footer-urun" className="text-body font-medium">
              Ürün
            </h2>
            <ul className="flex flex-col gap-2">
              {PRODUCT_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="rounded-md text-body text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex flex-col gap-3">
            <h2 className="text-body font-medium">Veri kaynakları</h2>
            <ul className="flex flex-col gap-2">
              {DATA_SOURCES.map((source) => (
                <li key={source.code} className="text-body text-muted-foreground">
                  <a
                    href={source.homepageUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="rounded-md underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    {source.code}
                  </a>{' '}
                  · {source.license}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-body font-medium">Yasal</h2>
            <ul className="flex flex-col gap-2">
              {LEGAL_PLACEHOLDERS.map((label) => (
                <li key={label} className="text-body text-muted-foreground">
                  {label}
                </li>
              ))}
            </ul>
            <p className="text-helper text-muted-foreground">
              Bu metinler hazırlanıyor ve pilot başlamadan önce burada yayımlanacak. Hazır olmayan bir belgeye
              bağlantı vermiyoruz.
            </p>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-helper text-muted-foreground">© {year} Öğün. Tüm hakları saklıdır.</p>
          <p className="text-helper text-muted-foreground">
            Besin bileşim verileri BLS 4.0 (CC BY 4.0) ve USDA FoodData Central (kamu malı) kaynaklıdır.
          </p>
        </div>
      </div>
    </footer>
  )
}

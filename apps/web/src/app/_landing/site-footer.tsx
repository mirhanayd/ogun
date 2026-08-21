import Image from 'next/image'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { DATA_SOURCES } from './content'

const PRODUCT_LINKS = [
  { href: '#urun', label: 'Ürünü incele' },
  { href: '/indir', label: 'Masaüstü uygulaması' },
  { href: '/kayit', label: 'Yönetici hesabı oluştur' },
  { href: '/giris', label: 'Giriş yap' },
]

const LEGAL_PLACEHOLDERS = [
  'KVKK aydınlatma metni',
  'Açık rıza metni',
  'Çerez politikası',
  'Kullanım koşulları',
]

export function SiteFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-border bg-muted/25">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[1.4fr_0.8fr_0.9fr_1fr] lg:gap-12">
          <div className="max-w-sm">
            <Image
              src="/brand/ogun-logo-yatay.svg"
              alt="Öğün"
              width={154}
              height={76}
              unoptimized
              className="h-9 w-auto dark:hidden"
            />
            <Image
              src="/brand/ogun-logo-koyu-zemin.svg"
              alt="Öğün"
              width={200}
              height={104}
              unoptimized
              className="hidden h-9 w-auto dark:block"
            />
            <p className="mt-5 text-sm leading-6 text-muted-foreground">
              Diyetisyen klinikleri için planlama motoru, danışan takibi ve ekip çalışma alanı.
            </p>
            <p className="mt-4 text-xs font-medium tracking-wide text-muted-foreground">
              Türkiye ve KKTC için geliştiriliyor.
            </p>
          </div>

          <nav aria-labelledby="footer-urun">
            <h2 id="footer-urun" className="text-xs font-semibold tracking-[0.14em] uppercase">
              Ürün
            </h2>
            <ul className="mt-4 space-y-3">
              {PRODUCT_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="rounded text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <h2 className="text-xs font-semibold tracking-[0.14em] uppercase">Veri kaynakları</h2>
            <ul className="mt-4 space-y-4">
              {DATA_SOURCES.map((source) => (
                <li key={source.code}>
                  <a
                    href={source.homepageUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="group inline-flex items-center gap-1.5 rounded text-sm font-medium underline-offset-4 hover:underline"
                  >
                    {source.code}
                    <ArrowUpRight
                      aria-hidden="true"
                      className="size-3 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                    />
                  </a>
                  <p className="mt-1 text-xs text-muted-foreground">{source.license}</p>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-xs font-semibold tracking-[0.14em] uppercase">Yasal</h2>
            <ul className="mt-4 space-y-3">
              {LEGAL_PLACEHOLDERS.map((label) => (
                <li key={label} className="text-sm text-muted-foreground">
                  {label}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[0.6875rem] leading-4 text-muted-foreground">
              Yasal metinler yayımlanmadan ürün canlı kullanıma açılmaz.
            </p>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} Öğün. Tüm hakları saklıdır.</p>
          <p>BLS 4.0 ve USDA FoodData Central verileriyle çalışır.</p>
        </div>
      </div>
    </footer>
  )
}

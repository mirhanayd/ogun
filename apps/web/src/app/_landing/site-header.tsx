import Image from 'next/image'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

const NAV_LINKS = [
  { href: '#urun', label: 'Ürün' },
  { href: '#neden-ogun', label: 'Neden Öğün' },
  { href: '#kaynaklar', label: 'Veri kaynakları' },
  { href: '#sss', label: 'SSS' },
]

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 backdrop-blur-xl">
      <div className="mx-auto flex h-[4.5rem] max-w-7xl items-center gap-5 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          aria-label="Öğün ana sayfa"
          className="flex shrink-0 items-center rounded-lg focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <Image
            src="/brand/ogun-logo-yatay.svg"
            alt="Öğün"
            width={154}
            height={76}
            priority
            unoptimized
            className="h-9 w-auto dark:hidden"
          />
          <Image
            src="/brand/ogun-logo-koyu-zemin.svg"
            alt="Öğün"
            width={200}
            height={104}
            priority
            unoptimized
            className="hidden h-9 w-auto dark:block"
          />
        </Link>

        <div className="hidden h-5 w-px bg-border lg:block" aria-hidden="true" />
        <p className="hidden text-xs font-medium tracking-wide text-muted-foreground lg:block">
          Klinik çalışma alanı
        </p>

        <nav aria-label="Sayfa bölümleri" className="ml-auto hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5 md:ml-2">
          <Button asChild variant="ghost" className="h-10 px-3">
            <Link href="/giris">Giriş yap</Link>
          </Button>
          <Button asChild className="h-10 rounded-xl px-4 shadow-sm shadow-primary/20">
            <Link href="/kayit">
              <span className="hidden sm:inline">Klinik hesabı oluştur</span>
              <span className="sm:hidden">Hesap oluştur</span>
              <ArrowUpRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  )
}

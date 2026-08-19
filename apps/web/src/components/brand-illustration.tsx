import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

// GitHub issue #62 / Faz 10, Prompt 10.4, GÖREV 1 — "Boş durumlarda marka
// illüstrasyonu veya ikonu kullan, düz metin bırakma."
//
// Bu, UYDURULMUŞ bir illüstrasyon DEĞİL: geometri, marka uygulama ikonunun
// (public/brand/ogun-uygulama-ikonu.svg) motifinin ta kendisi — açık bir
// tabak halkası + üstünde iki nokta. Orada beyaz üzerine yeşil kare olarak
// kullanılıyor; burada zemin şeffaf ve renkler tasarım sistemi token'larından
// (--primary, --accent) okunuyor, böylece açık ve koyu temada AYRI bir varlık
// dosyası gerekmiyor (bkz. globals.css, issue #59).
//
// Neden bir <img> değil: SVG'yi satır içi çizmek renklerin temaya bağlanmasını
// sağlıyor; public/brand altındaki dosyalar SABİT #1B7A5A kullanıyor ve koyu
// zeminde kontrastı düşük kalıyordu.
export function EmptyStateIllustration({
  icon: Icon,
  className,
}: {
  icon: LucideIcon
  className?: string
}) {
  return (
    <div className={cn('relative flex size-24 shrink-0 items-center justify-center', className)}>
      <svg
        viewBox="0 0 96 96"
        aria-hidden="true"
        focusable="false"
        className="absolute inset-0 size-full text-primary"
      >
        <circle cx="48" cy="54" r="28" className="fill-accent" />
        <circle
          cx="48"
          cy="54"
          r="28"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.22"
          strokeWidth="5"
        />
        {/* Açık halka — marka ikonundaki "tamamlanmakta olan tabak" motifi. */}
        <circle
          cx="48"
          cy="54"
          r="28"
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray="120 56"
          transform="rotate(-115 48 54)"
        />
        <circle cx="36" cy="14" r="5" fill="currentColor" fillOpacity="0.85" />
        <circle cx="58" cy="14" r="5" fill="currentColor" fillOpacity="0.4" />
      </svg>
      <Icon className="relative size-7 text-primary" aria-hidden="true" />
    </div>
  )
}

'use client'

import { useEffect } from 'react'
import { TriangleAlert } from 'lucide-react'
import { ErrorScreen } from '@/components/error-screen'

// GitHub issue #62 / Faz 10, Prompt 10.4, GÖREV 2 — kök hata sınırı.
// Buraya (app) grubunun DIŞINDAKİ sayfalar düşer: landing (/), /giris,
// /kayit, /kurulum, /klinik-sec, /indir, /p/[token]. (app) segmentinin
// KENDİ error.tsx'i var — orası uygulama kabuğunu (kenar çubuğu, üst bar)
// KORUYARAK hata gösterir, bu dosya ise tam sayfa gösterir.
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Sentry, sunucu tarafında instrumentation üzerinden zaten yakalıyor
    // (bkz. lib/monitoring/sentry-server.ts); burada tarayıcı konsoluna
    // yazmak, destek yazışmasında kullanıcıdan istenebilecek tek ek bilgi.
    console.error('[error.tsx] beklenmeyen hata:', error)
  }, [error])

  return (
    <ErrorScreen
      icon={TriangleAlert}
      title="Bu sayfa yüklenemedi"
      description="Beklenmeyen bir sorun oluştu ve sayfa açılamadı. Tekrar denemek çoğu durumda yeterli olur; sorun sürerse birkaç dakika sonra yeniden deneyin."
      detail={error.digest}
      actions={[
        { label: 'Tekrar dene', onClick: () => reset() },
        { label: 'Ana sayfaya dön', href: '/', variant: 'outline' },
      ]}
      className="min-h-svh"
    />
  )
}

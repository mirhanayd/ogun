'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
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
    // instrumentation-client beforeSend katmanı exception içeriğini Sentry'ye
    // göndermeden önce PII'dan arındırır. Raw Error'ı console'a yazmak Vercel
    // dışındaki istemci log toplayıcılarında hassas veri bırakabilirdi.
    Sentry.captureException(error)
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

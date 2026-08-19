'use client'

import { useEffect } from 'react'
import { TriangleAlert } from 'lucide-react'
import { ErrorScreen } from '@/components/error-screen'

// GitHub issue #62 / Faz 10, Prompt 10.4, GÖREV 2 — (app) segmentinin hata
// sınırı. Kök error.tsx'ten FARKI: bu sınır layout.tsx'in İÇİNDE olduğu için
// kenar çubuğu ve üst bar AYAKTA KALIR — kullanıcı hatalı bir ekrandan
// çıkmak için tarayıcının geri düğmesine mahkûm olmaz, doğrudan başka bir
// bölüme geçebilir.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[(app)/error.tsx] beklenmeyen hata:', error)
  }, [error])

  return (
    <ErrorScreen
      icon={TriangleAlert}
      title="Bu ekran yüklenemedi"
      description="Veriler getirilirken beklenmeyen bir sorun oluştu. Yaptığınız son değişiklikler kaybolmadıysa tekrar denemek yeterlidir; sorun sürerse sol menüden başka bir bölüme geçip geri dönün."
      detail={error.digest}
      actions={[
        { label: 'Tekrar dene', onClick: () => reset() },
        { label: 'Panele dön', href: '/panel', variant: 'outline' },
      ]}
    />
  )
}

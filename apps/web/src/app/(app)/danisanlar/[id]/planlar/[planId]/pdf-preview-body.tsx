'use client'

import { useEffect } from 'react'
import { usePDF } from '@react-pdf/renderer'
import { Loader2 } from 'lucide-react'
import { DietPlanDocument, type PdfPlanData } from '@ogun/pdf'
import { registerPdfFontsClient } from '@/lib/pdf/register-pdf-fonts-client'

// GitHub issue #35 / Prompt 6.1 — GÖREV: "İstemci tarafı önizleme
// (@react-pdf/renderer'ın PDFViewer/BlobProvider bileşenleri tarayıcıda da
// çalışır)". `usePDF` (react-pdf v4'ün hook API'si, BlobProvider'ın
// render-prop deseninin YERİNE) BİLEREK seçildi — bir React Hook kuralı
// açısından render-prop içinde başka bir Hook (blob hazır olduğunda üst
// bileşene bildirmek için gereken useEffect) çağırmak eslint-plugin-
// react-hooks'un "Hook bir bileşen/custom hook içinde değil" kuralını
// ihlal ederdi. usePDF, blob/url/loading/error'ı DOĞRUDAN bu bileşenin
// KENDİ render'ında hook olarak döner — daha temiz.
//
// BU DOSYA next/dynamic(..., { ssr: false }) ile YÜKLENİR (bkz.
// plan-pdf-dialog.tsx) — @react-pdf/renderer'ın tarayıcı derlemesi
// URL.createObjectURL/document gibi DOM API'lerine dayanıyor, Next.js'in
// 'use client' bileşenler için yaptığı SSR ilk-render'ında patlardı.
export function PdfPreviewBody({
  data,
  onBlobReady,
}: {
  data: PdfPlanData
  onBlobReady: (blob: Blob | null) => void
}) {
  useEffect(() => {
    registerPdfFontsClient()
  }, [])

  const [instance] = usePDF({ document: <DietPlanDocument data={data} /> })

  useEffect(() => {
    onBlobReady(instance.loading || instance.error ? null : (instance.blob ?? null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance.blob, instance.loading, instance.error])

  if (instance.loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        PDF hazırlanıyor…
      </div>
    )
  }
  if (instance.error || !instance.url) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-destructive">
        PDF önizlemesi oluşturulamadı.
      </div>
    )
  }
  return (
    <iframe
      title="PDF önizleme"
      src={instance.url}
      className="h-full w-full rounded-md border border-border"
    />
  )
}

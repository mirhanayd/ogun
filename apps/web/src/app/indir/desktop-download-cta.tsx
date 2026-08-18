'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { DesktopPlatform, DesktopRelease } from '@/lib/desktop-releases'
import { DESKTOP_PLATFORM_LABELS } from '@/lib/desktop-releases'

// GitHub issue #54 / Prompt 9.4, GÖREV 4 — "işletim sistemi otomatik
// algılanır, doğru indirme linki öne çıkar". OS algılama `navigator`a
// ihtiyaç duyduğundan (sunucu bileşeninde YOK) bu KÜÇÜK bir istemci
// bileşeni — sayfanın geri kalanı (sürüm notları, sistem gereksinimleri,
// kurulum adımları, bkz. page.tsx) sunucuda kalır.
function detectPlatform(): DesktopPlatform | null {
  if (typeof navigator === 'undefined') return null
  // `navigator.userAgentData.platform` daha güvenilir ama SADECE Chromium
  // tabanlı tarayıcılarda var — `userAgent`/`platform` ikisi BİRLİKTE her
  // tarayıcıda (Safari/Firefox dahil) çalışan, geriye dönük uyumlu bir
  // algılama sağlıyor. YANLIŞ algılama durumunda kullanıcı SIKIŞMAZ — her
  // iki platform da her zaman ayrıca listelenir (bkz. aşağısı).
  const ua = `${navigator.userAgent} ${navigator.platform}`.toLowerCase()
  if (ua.includes('mac') || ua.includes('darwin')) return 'macos'
  if (ua.includes('win')) return 'windows'
  return null
}

export function DesktopDownloadCta({ release }: { release: DesktopRelease }) {
  const [detected, setDetected] = useState<DesktopPlatform | null>(null)

  useEffect(() => {
    setDetected(detectPlatform())
  }, [])

  // Algılanan platform için indirme(ler) öne, diğerleri "Diğer sürümler"
  // altına — algılama yanlış/eksik OLSA BİLE (ör. Linux, ya da
  // navigator henüz mount olmadan ÖNCEki ilk render) hiçbir indirme linki
  // KAYBOLMAZ.
  const primaryDownloads = detected ? release.downloads.filter((d) => d.platform === detected) : []
  const otherDownloads = detected ? release.downloads.filter((d) => d.platform !== detected) : release.downloads

  return (
    <div className="flex flex-col gap-4">
      {primaryDownloads.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            {DESKTOP_PLATFORM_LABELS[detected as DesktopPlatform]} kullandığınızı algıladık:
          </p>
          <div className="flex flex-wrap gap-2">
            {primaryDownloads.map((asset) => (
              <Button key={asset.url} asChild size="lg">
                <a href={asset.url}>Öğün&apos;ü İndir — {asset.label}</a>
              </Button>
            ))}
          </div>
        </div>
      )}

      {otherDownloads.length > 0 && (
        <div className="flex flex-col gap-2">
          {primaryDownloads.length > 0 && (
            <p className="text-sm text-muted-foreground">Diğer platformlar:</p>
          )}
          <div className="flex flex-wrap gap-2">
            {otherDownloads.map((asset) => (
              <Button key={asset.url} asChild variant={primaryDownloads.length > 0 ? 'outline' : 'default'} size="lg">
                <a href={asset.url}>
                  {DESKTOP_PLATFORM_LABELS[asset.platform]} — {asset.label}
                </a>
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

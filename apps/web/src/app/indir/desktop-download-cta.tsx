'use client'

import { useEffect, useState } from 'react'
import { ArrowUpRight, Download, MonitorDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { DesktopPlatform, DesktopRelease } from '@/lib/desktop-releases'

function detectPlatform(): DesktopPlatform | null {
  if (typeof navigator === 'undefined') return null
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

  const windowsAsset = release.downloads.find((asset) => asset.platform === 'windows')
  const preferredAsset =
    release.downloads.find((asset) => asset.platform === detected) ?? windowsAsset
  const otherAssets = release.downloads.filter((asset) => asset !== preferredAsset)

  if (!preferredAsset) return null

  return (
    <div className="flex flex-col items-start gap-3">
      <Button
        asChild
        size="lg"
        className="h-13 rounded-xl bg-white px-5 text-[0.9375rem] text-[#123d2e] shadow-[0_12px_35px_rgba(0,0,0,.22)] hover:bg-emerald-50"
      >
        <a href={preferredAsset.url}>
          <Download aria-hidden="true" />
          {preferredAsset.platform === 'macos' ? 'macOS için indir' : 'Windows için indir'}
        </a>
      </Button>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-emerald-50/60">
        <span className="inline-flex items-center gap-1.5">
          <MonitorDown aria-hidden="true" className="size-3.5" />
          {preferredAsset.label}
        </span>
        <a
          href={`https://github.com/mirhanayd/ogun/releases/tag/desktop-v${release.version}`}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 rounded underline-offset-4 hover:text-white hover:underline"
        >
          Sürüm ayrıntıları
          <ArrowUpRight aria-hidden="true" className="size-3.5" />
        </a>
      </div>
      {otherAssets.map((asset) => (
        <a
          key={asset.platform}
          href={asset.url}
          className="text-xs text-emerald-100/70 underline-offset-4 hover:text-white hover:underline"
        >
          {asset.platform === 'macos' ? 'macOS' : 'Windows'} sürümünü indir
        </a>
      ))}
    </div>
  )
}

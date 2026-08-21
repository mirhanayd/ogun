'use client'

import { usePathname } from 'next/navigation'
import { NAV_ITEMS } from './nav-items'

const DETAIL_LABELS: Array<[RegExp, string]> = [
  [/^\/danisanlar\/yeni/, 'Yeni danışan'],
  [/^\/danisanlar\/[^/]+\/planlar\//, 'Diyet planı'],
  [/^\/danisanlar\/[^/]+/, 'Danışan profili'],
  [/^\/planlar\/sablonlar/, 'Plan şablonları'],
  [/^\/ayarlar\//, 'Ayarlar'],
]

export function PageContext() {
  const pathname = usePathname()
  const detail = DETAIL_LABELS.find(([pattern]) => pattern.test(pathname))?.[1]
  const parent = NAV_ITEMS.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  )
  const label = detail ?? parent?.label ?? 'Çalışma alanı'

  return (
    <div className="hidden min-w-0 flex-col md:flex">
      <span className="text-[10px] font-semibold tracking-[0.13em] text-muted-foreground uppercase">
        Çalışma alanı
      </span>
      <span className="truncate text-sm font-semibold tracking-[-0.01em] text-foreground">
        {label}
      </span>
    </div>
  )
}

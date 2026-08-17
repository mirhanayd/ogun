import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface EmptyStateAction {
  label: string
  href?: string
  onClick?: () => void
  // Modül henüz yoksa (ör. randevu takvimi — henüz açılmamış bir issue) eylem burada
  // görünür ama tıklanamaz durumda kalır, "Yakında" rozeti ile.
  disabled?: boolean
  hint?: string
}

export interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  action?: EmptyStateAction
  className?: string
  // GitHub issue #47 / Prompt 8.3, GÖREV 1 — "örnek plan oluştur" gibi bazı
  // boş durumlar TEK bir birincil eylemden (action prop) fazlasını göstermek
  // ister (ör. "Yeni danışan" YANINDA "Örnek danışan ve plan oluştur").
  // EmptyStateAction'ı bir DİZİYE genişletmek yerine (mevcut TÜM çağıranların
  // imzasını değiştirirdi) BİLEREK opsiyonel bir children eklendi — geriye
  // dönük UYUMLU, sadece bu ihtiyacı olan çağıranlar kullanır.
  children?: React.ReactNode
}

// Uygulama kabuğundaki her yer tutucu sayfa (Panel, Danışanlar, Randevular…)
// bu bileşeni kullanır — ürünün "hızlı hissettiren" tarafının bir parçası
// (bkz. GitHub issue #11 / Prompt 3.2, GÖREV 4).
export function EmptyState({ icon: Icon, title, description, action, className, children }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border p-10 text-center',
        className,
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <Icon className="size-6 text-muted-foreground" />
      </div>
      <div className="flex max-w-sm flex-col gap-1">
        <h2 className="text-sm font-medium">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {action && <EmptyStateActionButton action={action} />}
      {children}
    </div>
  )
}

function EmptyStateActionButton({ action }: { action: EmptyStateAction }) {
  if (action.disabled) {
    return (
      <Button size="sm" disabled className="gap-1.5">
        {action.label}
        {action.hint && (
          <Badge variant="secondary" className="pointer-events-none">
            {action.hint}
          </Badge>
        )}
      </Button>
    )
  }
  if (action.href) {
    return (
      <Button asChild size="sm">
        <Link href={action.href}>{action.label}</Link>
      </Button>
    )
  }
  return (
    <Button size="sm" onClick={action.onClick}>
      {action.label}
    </Button>
  )
}

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
}

// Uygulama kabuğundaki her yer tutucu sayfa (Panel, Danışanlar, Randevular…)
// bu bileşeni kullanır — ürünün "hızlı hissettiren" tarafının bir parçası
// (bkz. GitHub issue #11 / Prompt 3.2, GÖREV 4).
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
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

import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export function ScreenFrame({
  eyebrow,
  title,
  description,
  icon: Icon,
  actions,
  children,
}: {
  eyebrow: string
  title: string
  description: string
  icon: LucideIcon
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-6 pb-8">
      <header className="flex flex-col gap-5 border-b border-border/70 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-primary uppercase">
            <Icon className="size-3.5" />
            {eyebrow}
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">{title}</h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            {description}
          </p>
        </div>
        {actions ? <div className="flex flex-col gap-2 sm:flex-row">{actions}</div> : null}
      </header>
      {children}
    </div>
  )
}

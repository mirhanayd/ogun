import type { ComponentType, ReactNode } from 'react'
import { cn } from '@/lib/utils'

type WorkspaceIcon = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>

export function ClientWorkspaceHeader({
  icon: Icon,
  title,
  description,
  meta,
  actions,
}: {
  icon?: WorkspaceIcon
  title: string
  description: string
  meta?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        {Icon ? (
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-[1.125rem]" aria-hidden />
          </span>
        ) : null}
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-pretty text-lg font-semibold tracking-[-0.02em]">{title}</h2>
            {meta ? (
              <span className="text-xs tabular-nums text-muted-foreground">{meta}</span>
            ) : null}
          </div>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}

export function ClientWorkspaceSection({
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
}: {
  title?: string
  description?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
  contentClassName?: string
}) {
  return (
    <section className={cn('border-t border-border', className)}>
      {title || description || actions ? (
        <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            {title ? <h3 className="text-sm font-semibold">{title}</h3> : null}
            {description ? (
              <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
          ) : null}
        </div>
      ) : null}
      <div className={cn('pb-5', contentClassName)}>{children}</div>
    </section>
  )
}

export function ClientMetricStrip({
  items,
}: {
  items: Array<{ label: string; value: ReactNode; detail?: ReactNode; tone?: 'default' | 'alert' }>
}) {
  return (
    <dl className="grid grid-cols-2 divide-x divide-border border-y border-border sm:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="min-w-0 px-4 py-3 first:pl-0 last:pr-0 sm:px-5">
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd
            className={cn(
              'mt-1 truncate text-lg font-semibold tabular-nums',
              item.tone === 'alert' && 'text-destructive',
            )}
          >
            {item.value}
          </dd>
          {item.detail ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{item.detail}</p>
          ) : null}
        </div>
      ))}
    </dl>
  )
}

import type { ReactNode } from 'react'
import type { ComponentType, SVGProps } from 'react'

export function ScreenFrame({
  title,
  description,
  icon: Icon,
  actions,
  children,
}: {
  eyebrow: string
  title: string
  description: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col gap-5 pb-4">
      <header className="workspace-heading flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-3">
            <Icon className="size-6 shrink-0 text-muted-foreground" aria-hidden="true" />
            <h1 className="text-title tracking-tight">{title}</h1>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2 [&>*]:grow sm:[&>*]:grow-0">{actions}</div> : null}
      </header>
      {children}
    </div>
  )
}

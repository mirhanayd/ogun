import type { ReactNode } from 'react'
import { CircleAlert } from 'lucide-react'

interface AuthCardProps {
  eyebrow: string
  title: string
  description: string
  children: ReactNode
  footer?: ReactNode
}

export function AuthCard({ eyebrow, title, description, children, footer }: AuthCardProps) {
  return (
    <section className="w-full" aria-labelledby="auth-page-title">
      <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">{eyebrow}</p>
      <h1
        id="auth-page-title"
        className="mt-3 text-[clamp(2rem,4vw,2.8rem)] leading-[1.08] font-semibold tracking-[-0.045em] text-balance"
      >
        {title}
      </h1>
      <p className="mt-4 max-w-md text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
        {description}
      </p>

      <div className="mt-8">{children}</div>
      {footer ? <div className="mt-7 border-t border-border pt-6">{footer}</div> : null}
    </section>
  )
}

export function AuthError({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="flex gap-2.5 rounded-xl border border-destructive/20 bg-destructive/[0.06] px-3.5 py-3 text-sm text-destructive"
    >
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </div>
  )
}

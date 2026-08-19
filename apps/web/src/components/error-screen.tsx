import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyStateIllustration } from '@/components/brand-illustration'
import { cn } from '@/lib/utils'

// GitHub issue #62 / Faz 10, Prompt 10.4, GÖREV 2 — "error.tsx ve
// not-found.tsx (kök + (app) segmenti için)". Dört dosyanın da GÖRSEL
// gövdesi burada; her biri yalnızca metnini, ikonunu ve eylemlerini verir.
// Sunucu bileşeni (error.tsx'ler 'use client' olmak ZORUNDA ama bu bileşeni
// oradan da render edebilirler — içinde hook/olay yok, yalnızca `onRetry`
// verildiğinde bir düğmeye bağlanır).
export interface ErrorScreenAction {
  label: string
  href?: string
  onClick?: () => void
  variant?: 'default' | 'outline'
}

export function ErrorScreen({
  icon,
  code,
  title,
  description,
  actions,
  detail,
  className,
}: {
  icon: LucideIcon
  // "404", "500" gibi teknik kod — kullanıcıya yardımcı olmaz ama destek
  // yazışmasında işe yarar, bu yüzden küçük ve ikincil.
  code?: string
  title: string
  description: string
  actions: ErrorScreenAction[]
  // Sentry olay kimliği / hata digest'i — kullanıcının destek kanalında
  // paylaşabilmesi için.
  detail?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex min-h-[60svh] flex-col items-center justify-center gap-4 p-6 text-center',
        className,
      )}
    >
      <EmptyStateIllustration icon={icon} />
      <div className="flex max-w-md flex-col gap-1.5">
        {code && (
          <p className="text-helper font-medium tracking-wide text-muted-foreground">{code}</p>
        )}
        <h1 className="text-title">{title}</h1>
        <p className="text-body text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {actions.map((action) =>
          action.href ? (
            <Button key={action.label} asChild variant={action.variant ?? 'default'} size="sm">
              <Link href={action.href}>{action.label}</Link>
            </Button>
          ) : (
            <Button
              key={action.label}
              variant={action.variant ?? 'default'}
              size="sm"
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          ),
        )}
      </div>
      {detail && (
        <p className="text-helper text-muted-foreground">
          Destekle paylaşabileceğiniz hata kodu: <code className="font-mono">{detail}</code>
        </p>
      )}
    </div>
  )
}

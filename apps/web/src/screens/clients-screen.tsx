import type { ReactNode } from 'react'
import { Upload } from 'lucide-react'
import { OgunAddClient as UserPlus } from '@/components/ogun-icons'
import { Button } from '@/components/ui/button'
import { NavigationLink } from '@/components/navigation-link'

export interface ClientsSummary {
  totalClients: number
  todayAppointments: number
  attentionCount: number
}

export function ClientsScreen({
  role,
  actions,
  summary,
  children,
}: {
  role: 'owner' | 'dietitian' | 'assistant'
  actions?: ReactNode
  summary: ClientsSummary
  children: ReactNode
}) {
  void role
  return (
    <div className="flex min-w-0 flex-col gap-5 pb-4">
      <header className="flex items-end justify-between gap-6 border-b border-border pb-5">
        <div className="min-w-0">
          <h1 className="text-[1.625rem] font-medium tracking-[-0.03em]">Danışanlar</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            <span className="tabular-nums">{summary.totalClients}</span> danışan
            <span aria-hidden="true"> · </span>
            bugün <span className="tabular-nums">{summary.todayAppointments}</span> randevu
            <span aria-hidden="true"> · </span>
            <span className={summary.attentionCount > 0 ? 'text-destructive' : undefined}>
              <span className="tabular-nums">{summary.attentionCount}</span> dikkat gerekiyor
            </span>
          </p>
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </header>
      {children}
    </div>
  )
}

export function ClientsActionsView({ canImport = true }: { canImport?: boolean }) {
  return (
    <>
      {canImport ? (
        <Button asChild variant="ghost" size="icon-lg">
          <NavigationLink
            href="/danisanlar/ice-aktar"
            aria-label="CSV içe aktar"
            title="CSV içe aktar"
          >
            <Upload />
          </NavigationLink>
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon-lg"
          disabled
          aria-label="CSV içe aktar — çevrimiçi bağlantı gerekir"
          title="CSV içe aktarma için internet bağlantısı gerekir."
        >
          <Upload />
        </Button>
      )}
      <Button asChild size="lg">
        <NavigationLink href="/danisanlar/yeni">
          <UserPlus data-icon="inline-start" />
          Yeni danışan
        </NavigationLink>
      </Button>
    </>
  )
}

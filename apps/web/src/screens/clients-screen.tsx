import type { ReactNode } from 'react'
import { Upload, UserPlus, UsersRound } from 'lucide-react'
import { ScreenFrame } from './screen-frame'
import { Button } from '@/components/ui/button'
import { NavigationLink } from '@/components/navigation-link'

export function ClientsScreen({
  role,
  actions,
  children,
}: {
  role: 'owner' | 'dietitian' | 'assistant'
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <ScreenFrame
      eyebrow="Danışan operasyonu"
      title="Danışanlar"
      description={
        role === 'owner'
          ? 'Kliniğinizdeki tüm danışanları, atamaları ve bakım akışlarını yönetin.'
          : role === 'dietitian'
          ? 'Size atanan danışanların takip, ölçüm ve beslenme planlarına ulaşın.'
          : 'Yetkiniz kapsamındaki danışan kayıtlarına ve randevu akışlarına ulaşın.'
      }
      icon={UsersRound}
      actions={actions}
    >
      {children}
    </ScreenFrame>
  )
}

export function ClientsActionsView({ canImport = true }: { canImport?: boolean }) {
  return <>
    <Button asChild variant="outline" size="lg" className="rounded-xl bg-background/80 px-4" disabled={!canImport}>
      <NavigationLink href={canImport ? '/danisanlar/ice-aktar' : '#'} aria-disabled={!canImport} title={!canImport ? 'CSV içe aktarma için internet bağlantısı gerekir.' : undefined}>
        <Upload data-icon="inline-start" />CSV içe aktar
      </NavigationLink>
    </Button>
    <Button asChild size="lg" className="rounded-xl px-4 shadow-sm shadow-primary/15">
      <NavigationLink href="/danisanlar/yeni"><UserPlus data-icon="inline-start" />Yeni danışan</NavigationLink>
    </Button>
  </>
}

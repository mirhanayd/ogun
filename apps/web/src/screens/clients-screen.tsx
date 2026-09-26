import type { ReactNode } from 'react'
import { Upload } from 'lucide-react'
import { OgunAddClient as UserPlus, OgunClients as UsersRound } from '@/components/ogun-icons'
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
          ? 'Danışan kayıtları, son ölçümler ve randevular.'
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
    {canImport ? <Button asChild variant="outline" size="lg">
      <NavigationLink href="/danisanlar/ice-aktar">
        <Upload data-icon="inline-start" />CSV içe aktar
      </NavigationLink>
    </Button> : <Button variant="outline" size="lg" disabled title="CSV içe aktarma için internet bağlantısı gerekir."><Upload />CSV içe aktar (çevrimiçi)</Button>}
    <Button asChild size="lg">
      <NavigationLink href="/danisanlar/yeni"><UserPlus data-icon="inline-start" />Yeni danışan</NavigationLink>
    </Button>
  </>
}

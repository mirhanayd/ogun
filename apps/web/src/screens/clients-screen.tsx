import type { ReactNode } from 'react'
import { UsersRound } from 'lucide-react'
import { ScreenFrame } from './screen-frame'

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

import { Users } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'

// Danışan kaydı/listesi Prompt 4.1 (GitHub issue #12) kapsamında gelecek —
// packages/db/src/schema/clients.ts şu an hâlâ yer tutucu.
export default function DanisanlarPage() {
  return (
    <EmptyState
      icon={Users}
      title="Henüz danışan eklenmedi"
      description="Danışan kayıt akışı yakında burada olacak."
      action={{ label: 'Yeni danışan ekle', disabled: true, hint: 'Yakında' }}
    />
  )
}

import { ClipboardList } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'

// Diyet planı editörü — packages/db/src/schema/plans.ts şu an hâlâ yer
// tutucu, nutrition-core paketi (bkz. packages/nutrition-core) hesap
// motorunu zaten sağlıyor.
export default function PlanlarPage() {
  return (
    <EmptyState
      icon={ClipboardList}
      title="Henüz diyet planı yok"
      description="Danışanlarınız için diyet planı oluşturma ekranı yakında burada olacak."
      action={{ label: 'Yeni plan oluştur', disabled: true, hint: 'Yakında' }}
    />
  )
}

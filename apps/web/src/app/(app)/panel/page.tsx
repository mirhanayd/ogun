import { LayoutDashboard } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'

export default function PanelPage() {
  return (
    <EmptyState
      icon={LayoutDashboard}
      title="Panel yakında burada"
      description="Danışan özetleri, günün randevuları ve klinik metrikleri bu sayfada toplanacak."
    />
  )
}

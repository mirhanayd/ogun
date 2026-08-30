import { CircleHelp } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'

export function NotFoundScreen() {
  return <EmptyState icon={CircleHelp} title="Sayfa bulunamadı" description="Bu adres Öğün çalışma alanında tanımlı değil." />
}

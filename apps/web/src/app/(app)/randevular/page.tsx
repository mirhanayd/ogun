import { CalendarDays } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'

// Randevu modülü, onboarding'de toplanan çalışma saatlerini (bkz.
// packages/db/src/schema/appointments.ts clinicWorkingHours) müsaitlik
// hesabı için kullanacak — ayrı bir issue kapsamında.
export default function RandevularPage() {
  return (
    <EmptyState
      icon={CalendarDays}
      title="Henüz randevu yok"
      description="Klinik çalışma saatleriniz kaydedildi — randevu takvimi yakında burada olacak."
      action={{ label: 'Randevu oluştur', disabled: true, hint: 'Yakında' }}
    />
  )
}

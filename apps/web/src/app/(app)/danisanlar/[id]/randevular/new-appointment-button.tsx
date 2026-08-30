'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AppointmentDialog, type DietitianOption } from '../../../randevular/appointment-dialog'
import { createAppointmentAction, getClientPackageWarningAction, searchClientsAction } from '../../../randevular/actions'

// Danışan detayındaki "Randevu ver" hızlı eylemi (GitHub issue #39 / Prompt
// 7.1) — NewPlanButton (planlar/new-plan-button.tsx) ile AYNI desen: takvim
// modülünün AYNI AppointmentDialog'unu (yeni bir form KURMADAN) danışan
// önceden seçilmiş olarak açar.
export function NewAppointmentButton({
  clientId,
  clientName,
  dietitians,
  className,
}: {
  clientId: string
  clientName: string
  dietitians: DietitianOption[]
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} className={className ?? 'gap-1.5'}>
        <CalendarDays className="size-4" />
        Randevu ver
      </Button>
      <AppointmentDialog
        open={open}
        onOpenChange={setOpen}
        dietitians={dietitians}
        prefill={{ startsAt: new Date(), clientId, clientName }}
        onSearchClients={searchClientsAction}
        onGetPackageWarning={getClientPackageWarningAction}
        onSave={async (_appointmentId, _originalClientId, values, acknowledgeWarning) => createAppointmentAction(values, acknowledgeWarning)}
        onSaved={() => router.refresh()}
      />
    </>
  )
}

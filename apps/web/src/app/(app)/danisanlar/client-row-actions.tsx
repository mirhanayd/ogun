'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarPlus, Ruler } from 'lucide-react'
import type { ClientListRow } from '@ogun/db/queries'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { MeasurementForm } from './[id]/measurements/measurement-form'
import { createMeasurementAction } from './[id]/measurements/actions'
import { NewPlanButton } from './[id]/planlar/new-plan-button'
import { AppointmentDialog, type DietitianOption } from '../randevular/appointment-dialog'
import {
  createAppointmentAction,
  getClientPackageWarningAction,
  searchClientsAction,
} from '../randevular/actions'

export function ClientRowActions({
  client,
  dietitians,
}: {
  client: Omit<ClientListRow, 'lastMeasurementAt'> & {
    lastMeasurementAt: ClientListRow['lastMeasurementAt'] | string
  }
  dietitians: DietitianOption[]
}) {
  const [measurementOpen, setMeasurementOpen] = useState(false)
  const [appointmentOpen, setAppointmentOpen] = useState(false)
  const router = useRouter()
  const clientName = `${client.firstName} ${client.lastName}`

  return (
    <div className="flex items-center gap-0.5" onClick={(event) => event.stopPropagation()}>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        title="Ölçüm gir"
        aria-label={`${clientName} için ölçüm gir`}
        onClick={() => setMeasurementOpen(true)}
      >
        <Ruler />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        title="Randevu ver"
        aria-label={`${clientName} için randevu ver`}
        onClick={() => setAppointmentOpen(true)}
      >
        <CalendarPlus />
      </Button>
      <NewPlanButton clientId={client.id} iconOnly />

      <Dialog open={measurementOpen} onOpenChange={setMeasurementOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Yeni ölçüm</DialogTitle>
            <DialogDescription>{clientName} için ölçüm kaydı oluşturun.</DialogDescription>
          </DialogHeader>
          <MeasurementForm
            previousMeasurement={
              client.lastMeasurementAt
                ? {
                    measuredAt:
                      client.lastMeasurementAt instanceof Date
                        ? client.lastMeasurementAt.toISOString()
                        : client.lastMeasurementAt,
                    weightKg:
                      client.lastMeasurementWeightKg == null
                        ? null
                        : Number(client.lastMeasurementWeightKg),
                    heightCm: null,
                  }
                : null
            }
            onSave={async (values) => {
              const result = await createMeasurementAction(client.id, values)
              if (result.success) {
                setMeasurementOpen(false)
                router.refresh()
              }
              return result
            }}
          />
        </DialogContent>
      </Dialog>

      <AppointmentDialog
        open={appointmentOpen}
        onOpenChange={setAppointmentOpen}
        dietitians={dietitians}
        prefill={{ startsAt: new Date(), clientId: client.id, clientName }}
        onSearchClients={searchClientsAction}
        onGetPackageWarning={getClientPackageWarningAction}
        onSave={async (_appointmentId, _originalClientId, values, acknowledgeWarning) =>
          createAppointmentAction(values, acknowledgeWarning)
        }
        onSaved={() => router.refresh()}
      />
    </div>
  )
}

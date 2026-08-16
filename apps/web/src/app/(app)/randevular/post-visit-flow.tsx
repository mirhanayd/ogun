'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2, Scale, Salad, CalendarPlus } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  measurementFormSchema,
  MEASUREMENT_FORM_DEFAULT_VALUES,
  type MeasurementFormValues,
} from '@/lib/validation/measurement-schemas'
import {
  APPOINTMENT_DURATION_OPTIONS,
  APPOINTMENT_TYPE_OPTIONS,
  appointmentFormSchema,
  type AppointmentFormInput,
} from '@/lib/validation/appointment-schemas'
import { createMeasurementAction } from '../danisanlar/[id]/measurements/actions'
import { createPlanAction } from '../planlar/actions'
import { createAppointmentAction } from './actions'

type Step = 'measurement' | 'plan' | 'next-appointment' | 'done'

// GitHub issue #39 / Prompt 7.1, GÖREV 4 — "Geldi" işaretlenince: ölçüm gir →
// plan oluştur/güncelle → bir sonraki randevu, TEK ekranda zincirlenir. Bu,
// spesifikasyonun "ürünün günlük kullanım omurgası" dediği akış — bu yüzden
// HER adım "Atla" ile geçilebilir (zorunlu değil) ama varsayılan yol TEK
// dialog içinde adım adım ilerler, ayrı sayfalara YÖNLENDİRMEZ (plan
// oluşturma HARİÇ: yeni bir plan editörü kendi başına karmaşık bir sayfa,
// oraya "Planı aç" ile GEÇİŞ yapılır — akış orada doğal olarak biter).
export function PostVisitFlow({
  open,
  onOpenChange,
  clientId,
  clientName,
  dietitianId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  clientId: string
  clientName: string
  dietitianId: string
}) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('measurement')

  function reset(nextOpen: boolean) {
    if (!nextOpen) setStep('measurement')
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{clientName} — görüşme akışı</DialogTitle>
          <DialogDescription>
            {step === 'measurement' && 'Adım 1/3 — Ölçüm gir'}
            {step === 'plan' && 'Adım 2/3 — Plan'}
            {step === 'next-appointment' && 'Adım 3/3 — Bir sonraki randevu'}
            {step === 'done' && 'Tamamlandı'}
          </DialogDescription>
        </DialogHeader>

        {step === 'measurement' && (
          <MeasurementStep
            clientId={clientId}
            onDone={() => setStep('plan')}
            onSkip={() => setStep('plan')}
          />
        )}
        {step === 'plan' && (
          <PlanStep
            clientId={clientId}
            onCreated={() => router.refresh()}
            onSkip={() => setStep('next-appointment')}
          />
        )}
        {step === 'next-appointment' && (
          <NextAppointmentStep
            clientId={clientId}
            dietitianId={dietitianId}
            onDone={() => {
              setStep('done')
              router.refresh()
            }}
            onSkip={() => {
              setStep('done')
              router.refresh()
            }}
          />
        )}
        {step === 'done' && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 className="size-10 text-primary" />
            <p className="text-sm text-muted-foreground">Görüşme akışı tamamlandı.</p>
            <Button onClick={() => reset(false)}>Kapat</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function MeasurementStep({
  clientId,
  onDone,
  onSkip,
}: {
  clientId: string
  onDone: () => void
  onSkip: () => void
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<MeasurementFormValues>({
    resolver: zodResolver(measurementFormSchema),
    defaultValues: MEASUREMENT_FORM_DEFAULT_VALUES,
  })

  async function onSubmit(values: MeasurementFormValues) {
    const result = await createMeasurementAction(clientId, values)
    if (!result.success) {
      toast.error(result.error ?? 'Ölçüm kaydedilemedi.')
      return
    }
    toast.success('Ölçüm kaydedildi')
    onDone()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Scale className="size-4" />
        Hızlı kilo girişi — detaylı ölçüm için danışan sayfasındaki Ölçümler sekmesi kullanılabilir.
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pv-weightKg">Kilo (kg)</Label>
          <Input id="pv-weightKg" inputMode="decimal" aria-invalid={!!errors.weightKg} {...register('weightKg')} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pv-measuredAt">Tarih</Label>
          <Input id="pv-measuredAt" type="date" {...register('measuredAt')} />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onSkip}>
          Atla
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          Kaydet ve devam et
        </Button>
      </DialogFooter>
    </form>
  )
}

function PlanStep({
  clientId,
  onCreated,
  onSkip,
}: {
  clientId: string
  onCreated: () => void
  onSkip: () => void
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function handleCreatePlan() {
    setBusy(true)
    const result = await createPlanAction({
      clientId,
      name: `Yeni plan — ${new Date().toLocaleDateString('tr-TR')}`,
      planType: 'günlük',
      status: 'taslak',
    })
    setBusy(false)
    if (!result.success || !result.data) {
      toast.error(result.error ?? 'Plan oluşturulamadı.')
      return
    }
    onCreated()
    router.push(`/danisanlar/${clientId}/planlar/${result.data.id}`)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Salad className="size-4" />
        Yeni bir plan oluşturup editöre geçebilir, ya da bu adımı atlayabilirsiniz (mevcut plan güncellenmeye
        devam edebilir).
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onSkip}>
          Atla
        </Button>
        <Button type="button" onClick={handleCreatePlan} disabled={busy}>
          Yeni plan oluştur ve aç
        </Button>
      </DialogFooter>
    </div>
  )
}

function NextAppointmentStep({
  clientId,
  dietitianId,
  onDone,
  onSkip,
}: {
  clientId: string
  dietitianId: string
  onDone: () => void
  onSkip: () => void
}) {
  const [warning, setWarning] = useState<string | null>(null)
  const {
    control,
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<AppointmentFormInput>({
    resolver: zodResolver(appointmentFormSchema),
    defaultValues: {
      clientId,
      dietitianId,
      date: defaultNextWeekDate(),
      startTime: '09:00',
      durationMinutes: 30,
      type: 'kontrol',
      location: '',
      notes: '',
    },
  })

  async function onSubmit(values: AppointmentFormInput, acknowledgeWarning = false) {
    const result = await createAppointmentAction(values, acknowledgeWarning)
    if (result.warning) {
      setWarning(result.warning)
      return
    }
    if (!result.success) {
      toast.error(result.error ?? 'Randevu oluşturulamadı.')
      return
    }
    toast.success('Bir sonraki randevu planlandı')
    onDone()
  }

  return (
    <form onSubmit={handleSubmit((values) => onSubmit(values, false))} className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <CalendarPlus className="size-4" />
        Bir sonraki kontrol randevusunu şimdi planlayın.
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pv-date">Tarih</Label>
          <Input id="pv-date" type="date" {...register('date')} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pv-startTime">Saat</Label>
          <Input id="pv-startTime" type="time" {...register('startTime')} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pv-durationMinutes">Süre</Label>
          <Controller
            control={control}
            name="durationMinutes"
            render={({ field }) => (
              <Select value={String(field.value)} onValueChange={(value) => field.onChange(Number(value))}>
                <SelectTrigger id="pv-durationMinutes">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {APPOINTMENT_DURATION_OPTIONS.map((minutes) => (
                    <SelectItem key={minutes} value={String(minutes)}>
                      {minutes} dk
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pv-type">Tip</Label>
        <Controller
          control={control}
          name="type"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="pv-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {APPOINTMENT_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>

      {warning && (
        <div className="rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          <p className="font-medium">{warning}</p>
          <div className="mt-2 flex gap-2">
            <Button type="button" size="sm" onClick={handleSubmit((values) => onSubmit(values, true))}>
              Evet, planla
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setWarning(null)}>
              Vazgeç
            </Button>
          </div>
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onSkip}>
          Atla
        </Button>
        <Button type="submit" disabled={isSubmitting || !!warning}>
          Planla
        </Button>
      </DialogFooter>
    </form>
  )
}

function defaultNextWeekDate(): string {
  const date = new Date()
  date.setDate(date.getDate() + 7)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

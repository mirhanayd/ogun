'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
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
import { Textarea } from '@/components/ui/textarea'
import {
  APPOINTMENT_DURATION_OPTIONS,
  APPOINTMENT_TYPE_OPTIONS,
  appointmentFormSchema,
  type AppointmentFormInput,
} from '@/lib/validation/appointment-schemas'
import {
  createAppointmentAction,
  getClientPackageWarningAction,
  updateAppointmentAction,
  type ClientPickerOption,
} from './actions'
import { ClientPicker } from './client-picker'
import type { AppointmentListRow } from './types'

export interface DietitianOption {
  id: string
  name: string
}

export interface AppointmentDialogPrefill {
  startsAt: Date
  clientId?: string
  clientName?: string
}

// GitHub issue #39 / Prompt 7.1, GÖREV 3 — randevu oluşturma/düzenleme
// formu. TEK bileşen HEM "boş slota tıkla → hızlı oluştur" HEM "mevcut
// randevuyu düzenle" (appointment prop verilirse) senaryosunu karşılar —
// new-client-form.tsx / measurement-form.tsx'teki AYNI mantık.
export function AppointmentDialog({
  open,
  onOpenChange,
  dietitians,
  defaultDietitianId,
  prefill,
  appointment,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  dietitians: DietitianOption[]
  defaultDietitianId?: string
  prefill?: AppointmentDialogPrefill
  appointment?: AppointmentListRow
}) {
  const router = useRouter()
  const [formError, setFormError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [selectedClient, setSelectedClient] = useState<ClientPickerOption | null>(null)
  // GitHub issue #40 / Prompt 7.2, GÖREV 2 — "kalan seans 1'e düşünce
  // randevu ekranında uyarı". `warning` state'inden (çakışma/çalışma saati
  // dışı, ENGELLEYİCİ) BİLEREK AYRI: bu SADECE bilgilendirir, kaydı
  // durdurmaz.
  const [packageWarning, setPackageWarning] = useState<string | null>(null)

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AppointmentFormInput>({
    resolver: zodResolver(appointmentFormSchema),
  })

  useEffect(() => {
    if (!open) return
    setFormError(null)
    setWarning(null)
    if (appointment) {
      setSelectedClient({
        id: appointment.clientId,
        firstName: appointment.clientFirstName,
        lastName: appointment.clientLastName,
      })
      const durationMinutes = Math.round(
        (appointment.endsAt.getTime() - appointment.startsAt.getTime()) / 60000,
      )
      reset({
        clientId: appointment.clientId,
        dietitianId: appointment.dietitianId,
        date: toDateInput(appointment.startsAt),
        startTime: toTimeInput(appointment.startsAt),
        durationMinutes,
        type: appointment.type,
        location: appointment.location ?? '',
        notes: appointment.notes ?? '',
      })
      return
    }
    setSelectedClient(
      prefill?.clientId
        ? { id: prefill.clientId, firstName: prefill.clientName ?? '', lastName: '' }
        : null,
    )
    reset({
      clientId: prefill?.clientId ?? '',
      dietitianId: defaultDietitianId ?? dietitians[0]?.id ?? '',
      date: prefill ? toDateInput(prefill.startsAt) : toDateInput(new Date()),
      startTime: prefill ? toTimeInput(prefill.startsAt) : '09:00',
      durationMinutes: 30,
      type: 'kontrol',
      location: '',
      notes: '',
    })
  }, [open, appointment, prefill, defaultDietitianId, dietitians, reset])

  // Danışan değiştikçe (seçim VEYA düzenlenen randevunun danışanı) kalan
  // seans uyarısını yeniden kontrol eder — dialog kapalıyken ÇALIŞMAZ.
  useEffect(() => {
    if (!open || !selectedClient) {
      setPackageWarning(null)
      return
    }
    let cancelled = false
    const clientName = `${selectedClient.firstName} ${selectedClient.lastName}`.trim()
    getClientPackageWarningAction(selectedClient.id, clientName).then((message) => {
      if (!cancelled) setPackageWarning(message)
    })
    return () => {
      cancelled = true
    }
  }, [open, selectedClient])

  async function onSubmit(values: AppointmentFormInput, acknowledgeWarning = false) {
    setFormError(null)
    const result = appointment
      ? await updateAppointmentAction(appointment.id, appointment.clientId, values, acknowledgeWarning)
      : await createAppointmentAction(values, acknowledgeWarning)

    if (result.warning) {
      setWarning(result.warning)
      return
    }
    if (!result.success) {
      setFormError(result.error ?? 'Randevu kaydedilemedi.')
      return
    }
    setWarning(null)
    toast.success(appointment ? 'Randevu güncellendi' : 'Randevu oluşturuldu')
    onOpenChange(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{appointment ? 'Randevuyu düzenle' : 'Yeni randevu'}</DialogTitle>
          <DialogDescription>
            {appointment ? 'Randevu bilgilerini güncelleyin.' : 'Danışan, süre ve tip seçerek randevu oluşturun.'}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit((values) => onSubmit(values, false))}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label>Danışan</Label>
            <Controller
              control={control}
              name="clientId"
              render={({ field }) => (
                <ClientPicker
                  value={selectedClient}
                  onSelect={(client) => {
                    setSelectedClient(client)
                    field.onChange(client.id)
                  }}
                />
              )}
            />
            {errors.clientId && <p className="text-xs text-destructive">{errors.clientId.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dietitianId">Diyetisyen</Label>
              <Controller
                control={control}
                name="dietitianId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="dietitianId">
                      <SelectValue placeholder="Diyetisyen seçin" />
                    </SelectTrigger>
                    <SelectContent>
                      {dietitians.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="type">Tip</Label>
              <Controller
                control={control}
                name="type"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="type">
                      <SelectValue placeholder="Tip seçin" />
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
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="date">Tarih</Label>
              <Input id="date" type="date" aria-invalid={!!errors.date} {...register('date')} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="startTime">Saat</Label>
              <Input id="startTime" type="time" aria-invalid={!!errors.startTime} {...register('startTime')} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="durationMinutes">Süre (dk)</Label>
              <Controller
                control={control}
                name="durationMinutes"
                render={({ field }) => (
                  <Select value={String(field.value)} onValueChange={(value) => field.onChange(Number(value))}>
                    <SelectTrigger id="durationMinutes">
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
            <Label htmlFor="location">Yer / bağlantı</Label>
            <Input
              id="location"
              placeholder="Klinik, oda 2 veya görüşme linki"
              {...register('location')}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Not</Label>
            <Textarea id="notes" rows={2} {...register('notes')} />
          </div>

          {packageWarning && !warning && (
            <div className="rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
              <p className="font-medium">{packageWarning}</p>
            </div>
          )}

          {warning && (
            <div className="rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
              <p className="font-medium">{warning}</p>
              <p className="mt-1 text-xs opacity-80">Yine de kaydetmek istiyor musunuz?</p>
              <div className="mt-2 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSubmit((values) => onSubmit(values, true))}
                  disabled={isSubmitting}
                >
                  Evet, kaydet
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setWarning(null)}>
                  Vazgeç
                </Button>
              </div>
            </div>
          )}

          {formError && <p className="text-sm text-destructive">{formError}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              İptal
            </Button>
            <Button type="submit" disabled={isSubmitting || !!warning}>
              {appointment ? 'Kaydet' : 'Oluştur'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function toDateInput(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function toTimeInput(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

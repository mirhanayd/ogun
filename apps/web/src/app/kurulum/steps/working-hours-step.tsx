'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { WEEKDAYS_TR } from '@/lib/onboarding'
import {
  workingHoursDraftSchema,
  type WorkingHourFormValue,
  type WorkingHoursDraftValues,
} from '@/lib/validation/onboarding-schemas'
import { saveWorkingHoursAction } from '../actions'

export function WorkingHoursStep({
  defaultValues,
  onBack,
  onCompleted,
}: {
  defaultValues: WorkingHourFormValue[]
  onBack: () => void
  onCompleted: () => void
}) {
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<WorkingHoursDraftValues>({
    resolver: zodResolver(workingHoursDraftSchema),
    // dayOfWeek forma dahil değil — bkz. lib/validation/onboarding-schemas.ts
    // workingHoursDraftSchema üstündeki not. Satır sırası WEEKDAYS_TR ile birebir.
    defaultValues: { hours: defaultValues.map(({ isOpen, startTime, endTime }) => ({ isOpen, startTime, endTime })) },
  })

  const hours = watch('hours')

  async function onSubmit(values: WorkingHoursDraftValues) {
    setFormError(null)
    const withDayOfWeek = values.hours.map((hour, index) => ({
      ...hour,
      dayOfWeek: WEEKDAYS_TR[index]!.value,
    }))
    const result = await saveWorkingHoursAction({ hours: withDayOfWeek })
    if (!result.success) {
      setFormError(result.error ?? 'Kaydedilemedi, lütfen tekrar deneyin.')
      return
    }
    onCompleted()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Çalışma saatleri</CardTitle>
          <CardDescription>Randevu modülü bu saatleri müsaitlik hesaplamak için kullanacak.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {WEEKDAYS_TR.map((day, index) => {
            const isOpen = hours?.[index]?.isOpen ?? true
            const dayErrors = errors.hours?.[index]
            return (
              <div key={day.value} className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                <label className="flex w-32 shrink-0 items-center gap-2 text-sm">
                  <input type="checkbox" className="size-4 rounded border-input" {...register(`hours.${index}.isOpen` as const)} />
                  {day.label}
                </label>
                <div className="flex flex-1 items-center gap-2">
                  {isOpen ? (
                    <>
                      <Input type="time" aria-invalid={!!dayErrors?.startTime} {...register(`hours.${index}.startTime` as const)} />
                      <span className="text-sm text-muted-foreground">—</span>
                      <Input type="time" aria-invalid={!!dayErrors?.endTime} {...register(`hours.${index}.endTime` as const)} />
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground">Kapalı</span>
                  )}
                </div>
                {(dayErrors?.endTime ?? dayErrors?.startTime) && (
                  <p className="text-xs text-destructive sm:ml-2">{dayErrors?.endTime?.message ?? dayErrors?.startTime?.message}</p>
                )}
              </div>
            )
          })}
          {formError && <p className="text-sm text-destructive">{formError}</p>}
        </CardContent>
        <CardFooter className="justify-between">
          <Button type="button" variant="ghost" onClick={onBack}>
            Geri
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Tamamlanıyor…' : 'Kurulumu tamamla'}
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}

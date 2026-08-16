'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  dataRetentionSettingSchema,
  type DataRetentionSettingFormValues,
} from '@/lib/validation/compliance-schemas'
import { updateDataRetentionAction } from './actions'

export function DataRetentionForm({ defaultValues }: { defaultValues: DataRetentionSettingFormValues }) {
  const [formError, setFormError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DataRetentionSettingFormValues>({
    resolver: zodResolver(dataRetentionSettingSchema),
    defaultValues,
  })

  async function onSubmit(values: DataRetentionSettingFormValues) {
    setFormError(null)
    setSaved(false)
    const result = await updateDataRetentionAction(values)
    if (!result.success) {
      setFormError(result.error ?? 'Kaydedilemedi, lütfen tekrar deneyin.')
      return
    }
    setSaved(true)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-3 sm:max-w-xs">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="dataRetentionDays">Saklama süresi (gün)</Label>
        <Input
          id="dataRetentionDays"
          type="number"
          min={30}
          max={36500}
          aria-invalid={!!errors.dataRetentionDays}
          {...register('dataRetentionDays')}
        />
        {errors.dataRetentionDays && <p className="text-sm text-destructive">{errors.dataRetentionDays.message}</p>}
      </div>
      {formError && <p className="text-sm text-destructive">{formError}</p>}
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting ? 'Kaydediliyor…' : 'Kaydet'}
        </Button>
        {saved && <span className="text-sm text-muted-foreground">Kaydedildi.</span>}
      </div>
    </form>
  )
}

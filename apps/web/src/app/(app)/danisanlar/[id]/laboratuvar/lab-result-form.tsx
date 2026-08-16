'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { LAB_ANALYTE_PRESETS } from '@ogun/nutrition-core'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  LAB_RESULT_FORM_DEFAULT_VALUES,
  labResultFormSchema,
  type LabResultFormValues,
} from '@/lib/validation/lab-schemas'
import { createLabResultAction } from './actions'

const PRESET_SENTINEL_CUSTOM = '__custom__'

// GÖREV 2 — "Sık kullanılan analitler için hazır liste ... referans
// aralıklarıyla, diyetisyen override edebilsin." Preset seçici SADECE
// analyte/unit/refMin/refMax alanlarını ÖNCEDEN DOLDURUR — form şemasının
// bir parçası DEĞİL (analyte hâlâ serbest metin, bkz. lab-schemas.ts dosya
// başı notu), diyetisyen seçtikten sonra istediği alanı elle değiştirebilir.
export function LabResultForm({ clientId }: { clientId: string }) {
  const router = useRouter()
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<LabResultFormValues>({
    resolver: zodResolver(labResultFormSchema),
    defaultValues: LAB_RESULT_FORM_DEFAULT_VALUES,
  })

  function applyPreset(code: string) {
    if (code === PRESET_SENTINEL_CUSTOM) return
    const preset = LAB_ANALYTE_PRESETS.find((p) => p.code === code)
    if (!preset) return
    setValue('analyte', preset.nameTr)
    setValue('unit', preset.unit)
    setValue('refMin', preset.refMin !== null ? preset.refMin.toString() : '')
    setValue('refMax', preset.refMax !== null ? preset.refMax.toString() : '')
  }

  async function onSubmit(values: LabResultFormValues) {
    setFormError(null)
    const result = await createLabResultAction(clientId, values)
    if (!result.success) {
      setFormError(result.error ?? 'Kaydedilemedi, lütfen tekrar deneyin.')
      return
    }
    reset(LAB_RESULT_FORM_DEFAULT_VALUES)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="analytePreset">Hazır analit listesi</Label>
        <Select onValueChange={applyPreset}>
          <SelectTrigger id="analytePreset" className="w-full sm:w-72">
            <SelectValue placeholder="Listeden seçin (isteğe bağlı, otomatik doldurur)" />
          </SelectTrigger>
          <SelectContent>
            {LAB_ANALYTE_PRESETS.map((preset) => (
              <SelectItem key={preset.code} value={preset.code}>
                {preset.nameTr}
              </SelectItem>
            ))}
            <SelectItem value={PRESET_SENTINEL_CUSTOM}>Diğer (elle gir)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="testedAt">Tahlil tarihi</Label>
          <Input id="testedAt" type="date" aria-invalid={!!errors.testedAt} {...register('testedAt')} />
          {errors.testedAt && <p className="text-sm text-destructive">{errors.testedAt.message}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="analyte">Analit</Label>
          <Input id="analyte" aria-invalid={!!errors.analyte} {...register('analyte')} />
          {errors.analyte && <p className="text-sm text-destructive">{errors.analyte.message}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="value">Değer</Label>
          <Input id="value" type="number" step="0.001" inputMode="decimal" aria-invalid={!!errors.value} {...register('value')} />
          {errors.value && <p className="text-sm text-destructive">{errors.value.message}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="unit">Birim</Label>
          <Input id="unit" aria-invalid={!!errors.unit} {...register('unit')} />
          {errors.unit && <p className="text-sm text-destructive">{errors.unit.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="refMin">Alt referans sınırı</Label>
          <Input id="refMin" type="number" step="0.001" inputMode="decimal" {...register('refMin')} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="refMax">Üst referans sınırı</Label>
          <Input id="refMax" type="number" step="0.001" inputMode="decimal" {...register('refMax')} />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="labName">Laboratuvar</Label>
          <Input id="labName" {...register('labName')} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notes">Notlar</Label>
        <Textarea id="notes" rows={2} {...register('notes')} />
      </div>

      {formError && <p className="text-sm text-destructive">{formError}</p>}

      <div>
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting ? 'Kaydediliyor…' : 'Sonucu kaydet'}
        </Button>
      </div>
    </form>
  )
}

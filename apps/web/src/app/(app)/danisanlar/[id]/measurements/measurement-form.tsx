'use client'

import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { calculateBmi, classifyBmi } from '@ogun/nutrition-core'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  MEASUREMENT_FORM_DEFAULT_VALUES,
  MEASUREMENT_SOURCE_OPTIONS,
  measurementFormSchema,
  type MeasurementFormValues,
} from '@/lib/validation/measurement-schemas'

export interface PreviousMeasurementSummary {
  measuredAt: string // ISO
  weightKg: number | null
  heightCm: number | null
}

// GÖREV 2 — Ölçüm giriş formu. TEK react-hook-form state'i hem "hızlı mod"
// (sadece kilo, Enter ile kaydet) hem "detaylı mod" (tüm alanlar, sekmeli)
// için kullanılır — bkz. lib/validation/measurement-schemas.ts dosya başı
// notu: mod değişimi sadece HANGİ alanların görünür olduğunu değiştirir,
// girilen değerler kaybolmaz.
export function MeasurementForm({
  clientId,
  previousMeasurement,
  onSave,
}: {
  clientId: string
  previousMeasurement: PreviousMeasurementSummary | null
  onSave: (values: MeasurementFormValues) => Promise<{ success: boolean; error?: string }>
}) {
  const [mode, setMode] = useState<'quick' | 'detailed'>('quick')
  const [formError, setFormError] = useState<string | null>(null)
  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<MeasurementFormValues>({
    resolver: zodResolver(measurementFormSchema),
    defaultValues: MEASUREMENT_FORM_DEFAULT_VALUES,
  })

  const weightKgRaw = useWatch({ control, name: 'weightKg' })
  const heightCmRaw = useWatch({ control, name: 'heightCm' })

  const weightKg = weightKgRaw ? Number(weightKgRaw) : null
  // Boy her ölçümde tekrar girilmeyebilir (bkz. schema/measurements.ts
  // heightCm notu) — formda boş bırakılmışsa BKİ önizlemesi için bir önceki
  // ölçümün boyuna düşülür, kaydedilen SATIRA yazılmaz (sadece anlık gösterge).
  const heightCm = heightCmRaw ? Number(heightCmRaw) : (previousMeasurement?.heightCm ?? null)
  const liveBmi = weightKg && heightCm ? calculateBmi(weightKg, heightCm) : null
  const weightDelta =
    weightKg !== null && previousMeasurement?.weightKg != null
      ? weightKg - previousMeasurement.weightKg
      : null

  async function onSubmit(values: MeasurementFormValues) {
    setFormError(null)
    const result = await onSave(values)
    if (!result.success) {
      setFormError(result.error ?? 'Kaydedilemedi, lütfen tekrar deneyin.')
      return
    }
    reset({ ...MEASUREMENT_FORM_DEFAULT_VALUES, source: values.source })
  }

  // Hızlı moddaki kilo alanında Enter'a basınca formu doğrudan gönderir —
  // GÖREV 2'nin "tek alan, Enter ile kaydet" isteği. Diğer moddaki/alt
  // alanlardaki normal Tab/Enter gezinmesine dokunmaz.
  function handleQuickModeKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      void handleSubmit(onSubmit)()
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 rounded-lg bg-muted p-[3px] text-sm">
          <button
            type="button"
            onClick={() => setMode('quick')}
            aria-pressed={mode === 'quick'}
            className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
              mode === 'quick' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            Hızlı giriş
          </button>
          <button
            type="button"
            onClick={() => setMode('detailed')}
            aria-pressed={mode === 'detailed'}
            className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
              mode === 'detailed'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground'
            }`}
          >
            Detaylı giriş
          </button>
        </div>

        {(liveBmi !== null || weightDelta !== null) && (
          <div className="flex items-center gap-2 text-sm">
            {liveBmi !== null && (
              <Badge variant="secondary">
                BKİ {liveBmi.toFixed(1)} · {BMI_CATEGORY_LABELS_TR[classifyBmi(liveBmi)]}
              </Badge>
            )}
            {weightDelta !== null && (
              <Badge
                variant={weightDelta > 0 ? 'outline' : weightDelta < 0 ? 'secondary' : 'outline'}
              >
                Önceki ölçüme göre {weightDelta > 0 ? '+' : ''}
                {weightDelta.toFixed(1)} kg
              </Badge>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="measuredAt">Ölçüm tarihi</Label>
          <Input
            id="measuredAt"
            type="date"
            aria-invalid={!!errors.measuredAt}
            {...register('measuredAt')}
          />
          {errors.measuredAt && (
            <p className="text-sm text-destructive">{errors.measuredAt.message}</p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="weightKg">Kilo (kg)</Label>
          <Input
            id="weightKg"
            type="number"
            step="0.1"
            inputMode="decimal"
            autoFocus
            aria-invalid={!!errors.weightKg}
            onKeyDown={mode === 'quick' ? handleQuickModeKeyDown : undefined}
            {...register('weightKg')}
          />
          {errors.weightKg && <p className="text-sm text-destructive">{errors.weightKg.message}</p>}
        </div>
        {mode === 'detailed' && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="source">Kaynak</Label>
            <Controller
              control={control}
              name="source"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="source" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MEASUREMENT_SOURCE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        )}
      </div>

      {mode === 'detailed' && (
        <Tabs defaultValue="cevre">
          <TabsList>
            <TabsTrigger value="cevre">Çevre ölçümleri</TabsTrigger>
            <TabsTrigger value="kompozisyon">Vücut kompozisyonu</TabsTrigger>
            <TabsTrigger value="notlar">Notlar</TabsTrigger>
          </TabsList>

          <TabsContent value="cevre" className="mt-3">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <DecimalField
                id="heightCm"
                label="Boy (cm)"
                error={errors.heightCm?.message}
                register={register}
              />
              <DecimalField
                id="waistCm"
                label="Bel (cm)"
                error={errors.waistCm?.message}
                register={register}
              />
              <DecimalField
                id="hipCm"
                label="Kalça (cm)"
                error={errors.hipCm?.message}
                register={register}
              />
              <DecimalField
                id="neckCm"
                label="Boyun (cm)"
                error={errors.neckCm?.message}
                register={register}
              />
              <DecimalField
                id="armCm"
                label="Kol (cm)"
                error={errors.armCm?.message}
                register={register}
              />
              <DecimalField
                id="thighCm"
                label="Uyluk (cm)"
                error={errors.thighCm?.message}
                register={register}
              />
              <DecimalField
                id="chestCm"
                label="Göğüs (cm)"
                error={errors.chestCm?.message}
                register={register}
              />
            </div>
          </TabsContent>

          <TabsContent value="kompozisyon" className="mt-3">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <DecimalField
                id="bodyFatPct"
                label="Yağ oranı (%)"
                error={errors.bodyFatPct?.message}
                register={register}
              />
              <DecimalField
                id="bodyFatKg"
                label="Yağ kütlesi (kg)"
                error={errors.bodyFatKg?.message}
                register={register}
              />
              <DecimalField
                id="leanMassKg"
                label="Yağsız kütle (kg)"
                error={errors.leanMassKg?.message}
                register={register}
              />
              <DecimalField
                id="muscleMassKg"
                label="Kas kütlesi (kg)"
                error={errors.muscleMassKg?.message}
                register={register}
              />
              <DecimalField
                id="totalBodyWaterL"
                label="Toplam vücut suyu (L)"
                error={errors.totalBodyWaterL?.message}
                register={register}
              />
              <DecimalField
                id="visceralFatLevel"
                label="Visseral yağ seviyesi"
                error={errors.visceralFatLevel?.message}
                register={register}
              />
              <DecimalField
                id="bmrKcal"
                label="BMH (kcal)"
                error={errors.bmrKcal?.message}
                register={register}
              />
              <DecimalField
                id="phaseAngle"
                label="Faz açısı (°)"
                error={errors.phaseAngle?.message}
                register={register}
              />
            </div>
          </TabsContent>

          <TabsContent value="notlar" className="mt-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="notes">Notlar</Label>
              <Textarea id="notes" rows={3} {...register('notes')} />
            </div>
          </TabsContent>
        </Tabs>
      )}

      {formError && <p className="text-sm text-destructive">{formError}</p>}

      <div>
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting ? 'Kaydediliyor…' : 'Ölçümü kaydet'}
        </Button>
      </div>
    </form>
  )
}

const BMI_CATEGORY_LABELS_TR: Record<ReturnType<typeof classifyBmi>, string> = {
  zayıf: 'Zayıf',
  normal: 'Normal',
  fazla_kilolu: 'Fazla kilolu',
  obez: 'Obez',
}

function DecimalField({
  id,
  label,
  error,
  register,
}: {
  id: keyof MeasurementFormValues
  label: string
  error?: string
  register: ReturnType<typeof useForm<MeasurementFormValues>>['register']
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        step="0.1"
        inputMode="decimal"
        aria-invalid={!!error}
        {...register(id)}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

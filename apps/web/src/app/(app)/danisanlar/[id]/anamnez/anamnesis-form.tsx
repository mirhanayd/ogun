'use client'

import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useAutosave, type AutosaveStatus } from '@/lib/use-autosave'
import {
  ACTIVITY_LEVEL_OPTIONS,
  ANAMNESIS_FORM_DEFAULT_VALUES,
  anamnesisFormSchema,
  textFromList,
  type AnamnesisFormValues,
} from '@/lib/validation/anamnesis-schemas'
import type { getClientHealthRecord } from './queries'
import { saveAnamnesisAction } from './actions'
import { AllergenListField } from './allergen-list-field'

type ClientHealthRow = Awaited<ReturnType<typeof getClientHealthRecord>>

// Anamnez formu (GitHub issue #19 / Prompt 4.3, GÖREV 1) — "sekmeli uzun
// form ... Otomatik kaydet (debounce 800ms), 'kaydedildi' göstergesi." Bu
// formda measurements/general-tab-form'un aksine bir "Kaydet" DÜĞMESİ YOK —
// tıpkı plan editörünün (roadmap Prompt 5.3) "Kaydet butonu OLMASIN"
// kuralıyla aynı ruh: diyetisyen doldurdukça arka planda kaydedilir.
export function AnamnesisForm({
  clientId,
  healthRecord,
}: {
  clientId: string
  healthRecord: ClientHealthRow
}) {
  const { control, register } = useForm<AnamnesisFormValues>({
    resolver: zodResolver(anamnesisFormSchema),
    defaultValues: healthRecord
      ? {
          conditions: textFromList(healthRecord.conditions),
          familyHistory: healthRecord.familyHistory ?? '',
          surgeries: healthRecord.surgeries ?? '',
          medications: textFromList(healthRecord.medications),
          allergies: healthRecord.allergies ?? [],
          intolerances: healthRecord.intolerances ?? [],
          smokingStatus: healthRecord.smokingStatus ?? '',
          alcoholUse: healthRecord.alcoholUse ?? '',
          mealsPerDay: healthRecord.mealsPerDay?.toString() ?? '',
          eatingOutFrequency: healthRecord.eatingOutFrequency ?? '',
          waterIntakeMl: healthRecord.waterIntakeMl?.toString() ?? '',
          activityLevel: healthRecord.activityLevel ?? null,
          activityNotes: healthRecord.activityNotes ?? '',
          sleepHours: healthRecord.sleepHours?.toString() ?? '',
          sleepQuality: healthRecord.sleepQuality ?? '',
          bowelHabits: healthRecord.bowelHabits ?? '',
        }
      : ANAMNESIS_FORM_DEFAULT_VALUES,
  })

  const formValues = useWatch({ control })

  const { status } = useAutosave<AnamnesisFormValues>(
    formValues as AnamnesisFormValues,
    (values) => saveAnamnesisAction(clientId, values),
  )

  return (
    <form className="flex flex-col gap-4" onSubmit={(event) => event.preventDefault()}>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Değişiklikler otomatik kaydedilir, ayrıca bir &quot;Kaydet&quot; işlemine gerek yoktur.
        </p>
        <AutosaveIndicator status={status} />
      </div>

      <Tabs defaultValue="saglik">
        <TabsList className="flex-wrap">
          <TabsTrigger value="saglik">Sağlık geçmişi</TabsTrigger>
          <TabsTrigger value="ilaclar">İlaçlar</TabsTrigger>
          <TabsTrigger value="alerjiler">Alerjiler</TabsTrigger>
          <TabsTrigger value="yasam">Yaşam tarzı</TabsTrigger>
          <TabsTrigger value="beslenme">Beslenme alışkanlıkları</TabsTrigger>
          <TabsTrigger value="aktivite">Fiziksel aktivite</TabsTrigger>
          <TabsTrigger value="uyku">Uyku</TabsTrigger>
          <TabsTrigger value="sindirim">Sindirim</TabsTrigger>
        </TabsList>

        <TabsContent value="saglik" className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="conditions">Kronik hastalıklar / tanılar</Label>
            <p className="text-xs text-muted-foreground">Her satıra bir tanı yazın.</p>
            <Textarea id="conditions" rows={4} {...register('conditions')} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="familyHistory">Aile öyküsü</Label>
            <Textarea id="familyHistory" rows={3} {...register('familyHistory')} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="surgeries">Geçirilmiş ameliyatlar</Label>
            <Textarea id="surgeries" rows={3} {...register('surgeries')} />
          </div>
        </TabsContent>

        <TabsContent value="ilaclar" className="mt-4 flex flex-col gap-1.5">
          <Label htmlFor="medications">Kullandığı ilaçlar / takviyeler</Label>
          <p className="text-xs text-muted-foreground">Her satıra bir ilaç adı yazın.</p>
          <Textarea id="medications" rows={6} {...register('medications')} />
        </TabsContent>

        <TabsContent value="alerjiler" className="mt-4 flex flex-col gap-6">
          <Controller
            control={control}
            name="allergies"
            render={({ field }) => (
              <AllergenListField label="Besin alerjileri" value={field.value} onChange={field.onChange} />
            )}
          />
          <Controller
            control={control}
            name="intolerances"
            render={({ field }) => (
              <AllergenListField label="Besin intoleransları" value={field.value} onChange={field.onChange} />
            )}
          />
        </TabsContent>

        <TabsContent value="yasam" className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="smokingStatus">Sigara kullanımı</Label>
            <Input id="smokingStatus" placeholder="ör. Kullanmıyor / Günde 10 adet" {...register('smokingStatus')} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="alcoholUse">Alkol kullanımı</Label>
            <Input id="alcoholUse" placeholder="ör. Sosyal içici" {...register('alcoholUse')} />
          </div>
        </TabsContent>

        <TabsContent value="beslenme" className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mealsPerDay">Günlük öğün sayısı</Label>
            <Input id="mealsPerDay" type="number" inputMode="numeric" {...register('mealsPerDay')} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="eatingOutFrequency">Dışarıda yeme sıklığı</Label>
            <Input id="eatingOutFrequency" placeholder="ör. Haftada 2-3 kez" {...register('eatingOutFrequency')} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="waterIntakeMl">Günlük su tüketimi (mL)</Label>
            <Input id="waterIntakeMl" type="number" inputMode="numeric" {...register('waterIntakeMl')} />
          </div>
        </TabsContent>

        <TabsContent value="aktivite" className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="activityLevel">Aktivite düzeyi</Label>
            <Controller
              control={control}
              name="activityLevel"
              render={({ field }) => (
                <Select
                  value={field.value ?? ''}
                  onValueChange={(v) => field.onChange(v === '' ? null : v)}
                >
                  <SelectTrigger id="activityLevel" className="w-full">
                    <SelectValue placeholder="Seçilmedi" />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTIVITY_LEVEL_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="activityNotes">Aktivite notları</Label>
            <Textarea
              id="activityNotes"
              rows={3}
              placeholder="ör. Haftada 3 gün 45 dk yürüyüş"
              {...register('activityNotes')}
            />
          </div>
        </TabsContent>

        <TabsContent value="uyku" className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sleepHours">Ortalama uyku süresi (saat)</Label>
            <Input id="sleepHours" type="number" inputMode="numeric" {...register('sleepHours')} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sleepQuality">Uyku kalitesi</Label>
            <Input id="sleepQuality" placeholder="ör. Sık uyanıyor" {...register('sleepQuality')} />
          </div>
        </TabsContent>

        <TabsContent value="sindirim" className="mt-4 flex flex-col gap-1.5">
          <Label htmlFor="bowelHabits">Bağırsak alışkanlıkları</Label>
          <Textarea id="bowelHabits" rows={3} placeholder="ör. Günde 1 kez, düzenli" {...register('bowelHabits')} />
        </TabsContent>
      </Tabs>
    </form>
  )
}

function AutosaveIndicator({ status }: { status: AutosaveStatus }) {
  if (status === 'idle') return null
  if (status === 'saving') return <Badge variant="secondary">Kaydediliyor…</Badge>
  if (status === 'error') return <Badge variant="destructive">Kaydedilemedi</Badge>
  return <Badge variant="outline">Kaydedildi</Badge>
}

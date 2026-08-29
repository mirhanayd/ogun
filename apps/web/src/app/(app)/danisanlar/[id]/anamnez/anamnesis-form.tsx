'use client'

import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Badge } from '@/components/ui/badge'
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
import {
  ConditionCatalogSelector,
  type ConditionCatalogSelection,
} from './condition-catalog-selector'
import {
  MedicationCatalogSelector,
  type MedicationCatalogSelection,
} from './medication-catalog-selector'

type ClientHealthRow = Awaited<ReturnType<typeof getClientHealthRecord>>

function initialConditionSelections(record: ClientHealthRow): ConditionCatalogSelection[] {
  return record.conditionSelections.map((condition) => ({
    conditionId: condition.conditionId,
    nameTr: condition.nameTr,
    nameEn: condition.nameEn,
    sourceCode: condition.sourceCode,
    isNeoplasm: condition.isNeoplasm,
    needsReview: condition.needsReview,
  }))
}

function initialMedicationSelections(record: ClientHealthRow): MedicationCatalogSelection[] {
  const selections: MedicationCatalogSelection[] = []
  for (const medication of record.medicationSelections) {
    if (medication.medicationProductId && medication.productName) {
      selections.push({
        key: `product:${medication.medicationProductId}`,
        kind: 'product',
        medicationProductId: medication.medicationProductId,
        medicationSubstanceId: null,
        name: medication.productName,
        substanceNames: medication.productSubstanceNames,
        barcode: medication.productBarcode,
        needsReview: false,
      })
      continue
    }
    if (medication.medicationSubstanceId && medication.substanceName) {
      selections.push({
        key: `substance:${medication.medicationSubstanceId}`,
        kind: 'substance',
        medicationProductId: null,
        medicationSubstanceId: medication.medicationSubstanceId,
        name: medication.substanceName,
        substanceNames: [],
        barcode: null,
        needsReview: medication.substanceNeedsReview ?? false,
      })
    }
  }
  return selections
}

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
    defaultValues: healthRecord.healthRecord
      ? {
          conditions: textFromList(healthRecord.legacyConditions),
          conditionSelections: initialConditionSelections(healthRecord),
          familyHistory: healthRecord.healthRecord.familyHistory ?? '',
          surgeries: healthRecord.healthRecord.surgeries ?? '',
          medications: textFromList(healthRecord.legacyMedications),
          medicationSelections: initialMedicationSelections(healthRecord),
          allergies: healthRecord.healthRecord.allergies ?? [],
          intolerances: healthRecord.healthRecord.intolerances ?? [],
          smokingStatus: healthRecord.healthRecord.smokingStatus ?? '',
          alcoholUse: healthRecord.healthRecord.alcoholUse ?? '',
          mealsPerDay: healthRecord.healthRecord.mealsPerDay?.toString() ?? '',
          eatingOutFrequency: healthRecord.healthRecord.eatingOutFrequency ?? '',
          waterIntakeMl: healthRecord.healthRecord.waterIntakeMl?.toString() ?? '',
          activityLevel: healthRecord.healthRecord.activityLevel ?? null,
          activityNotes: healthRecord.healthRecord.activityNotes ?? '',
          sleepHours: healthRecord.healthRecord.sleepHours?.toString() ?? '',
          sleepQuality: healthRecord.healthRecord.sleepQuality ?? '',
          bowelHabits: healthRecord.healthRecord.bowelHabits ?? '',
        }
      : {
          ...ANAMNESIS_FORM_DEFAULT_VALUES,
          conditionSelections: initialConditionSelections(healthRecord),
          medicationSelections: initialMedicationSelections(healthRecord),
        },
  })

  const formValues = useWatch({ control })

  const { status } = useAutosave<AnamnesisFormValues>(formValues as AnamnesisFormValues, (values) =>
    saveAnamnesisAction(clientId, values),
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
            <Label>Kronik hastalıklar / tanılar</Label>
            <p className="text-xs text-muted-foreground">
              Hastalık ve kanser türlerini doğrulanmış katalogdan seçin.
            </p>
            <Controller
              control={control}
              name="conditionSelections"
              render={({ field }) => (
                <ConditionCatalogSelector value={field.value} onChange={field.onChange} />
              )}
            />
          </div>
          <div className="flex flex-col gap-1.5 rounded-lg border border-border/70 bg-muted/25 p-3">
            <Label htmlFor="conditions">Katalog dışı / eski tanı kayıtları</Label>
            <p className="text-xs text-muted-foreground">
              Önceden serbest metin olarak girilmiş değerler burada korunur. Belirsiz kayıtlar
              otomatik eşlenmez; katalogdan karşılığını seçtikten sonra ilgili satırı
              kaldırabilirsiniz.
            </p>
            <Textarea id="conditions" rows={3} {...register('conditions')} />
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
          <Label>Kullandığı ilaçlar</Label>
          <p className="text-xs text-muted-foreground">
            Ruhsatlı ürünü seçin; yalnız etkin madde biliniyorsa etkin madde sonucunu kullanın.
          </p>
          <Controller
            control={control}
            name="medicationSelections"
            render={({ field }) => (
              <MedicationCatalogSelector
                value={field.value as MedicationCatalogSelection[]}
                onChange={field.onChange}
              />
            )}
          />
          <div className="mt-3 flex flex-col gap-1.5 rounded-lg border border-border/70 bg-muted/25 p-3">
            <Label htmlFor="medications">Katalog dışı / eski ilaç ve takviye kayıtları</Label>
            <p className="text-xs text-muted-foreground">
              Eski serbest metin kayıtları kaybolmaz ve otomatik olarak bir ürüne bağlanmaz.
            </p>
            <Textarea id="medications" rows={4} {...register('medications')} />
          </div>
        </TabsContent>

        <TabsContent value="alerjiler" className="mt-4 flex flex-col gap-6">
          <Controller
            control={control}
            name="allergies"
            render={({ field }) => (
              <AllergenListField
                label="Besin alerjileri"
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
          <Controller
            control={control}
            name="intolerances"
            render={({ field }) => (
              <AllergenListField
                label="Besin intoleransları"
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </TabsContent>

        <TabsContent value="yasam" className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="smokingStatus">Sigara kullanımı</Label>
            <Input
              id="smokingStatus"
              placeholder="ör. Kullanmıyor / Günde 10 adet"
              {...register('smokingStatus')}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="alcoholUse">Alkol kullanımı</Label>
            <Input id="alcoholUse" placeholder="ör. Sosyal içici" {...register('alcoholUse')} />
          </div>
        </TabsContent>

        <TabsContent value="beslenme" className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mealsPerDay">Günlük öğün sayısı</Label>
            <Input
              id="mealsPerDay"
              type="number"
              inputMode="numeric"
              {...register('mealsPerDay')}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="eatingOutFrequency">Dışarıda yeme sıklığı</Label>
            <Input
              id="eatingOutFrequency"
              placeholder="ör. Haftada 2-3 kez"
              {...register('eatingOutFrequency')}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="waterIntakeMl">Günlük su tüketimi (mL)</Label>
            <Input
              id="waterIntakeMl"
              type="number"
              inputMode="numeric"
              {...register('waterIntakeMl')}
            />
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
          <Textarea
            id="bowelHabits"
            rows={3}
            placeholder="ör. Günde 1 kez, düzenli"
            {...register('bowelHabits')}
          />
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

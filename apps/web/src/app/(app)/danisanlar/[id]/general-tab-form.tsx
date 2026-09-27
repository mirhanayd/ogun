'use client'

import { useState, type ReactNode } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { ClinicDietitianOption } from '@ogun/db/queries'
import { NavigationLink } from '@/components/navigation-link'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  SEX_NOT_SPECIFIED,
  SEX_OPTIONS,
  STATUS_OPTIONS,
  clientGeneralInfoSchema,
  type ClientGeneralInfoFormValues,
} from '@/lib/validation/client-schemas'
export interface ClientGeneralInfoModel {
  id: string
  firstName: string
  lastName: string
  birthDate: string | null
  sex: 'male' | 'female' | null
  phone: string | null
  email: string | null
  occupation: string | null
  referralSource: string | null
  notes: string | null
  status: 'aktif' | 'pasif' | 'arşiv'
  smsConsentAt: Date | string | null
  assignedDietitianId: string | null
}

const underlinedControl =
  '!h-10 !rounded-none !border-0 !border-b !border-border !bg-transparent !px-0 !shadow-none focus-visible:!border-primary focus-visible:!ring-0'

function FieldRow({
  label,
  htmlFor,
  children,
  error,
  className = '',
}: {
  label: string
  htmlFor?: string
  children: ReactNode
  error?: string
  className?: string
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <Label htmlFor={htmlFor} className="text-xs font-normal text-muted-foreground">
        {label}
      </Label>
      <div className="mt-1">{children}</div>
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
    </div>
  )
}

function statusDot(status: ClientGeneralInfoFormValues['status']) {
  return status === 'aktif'
    ? 'bg-emerald-500'
    : status === 'arşiv'
      ? 'bg-destructive'
      : 'bg-muted-foreground/45'
}

// GÖREV 4 — "Genel" sekmesi, bu issue'nun kapsadığı gerçek alanları
// (demografik/iletişim/durum/notlar) düzenler. client_health (bu issue'da
// açılan tablo) BİLEREK buraya gömülmedi — bkz. schema/clients.ts
// clientHealth üstündeki not: tam anamnez formu GitHub issue #19 (Prompt
// 4.3)'ün kapsamı, "Anamnez" sekmesi o zaman bu tabloyu okuyup/yazacak.
//
// assignedDietitianId BİLEREK bu formda DÜZENLENEMİYOR (salt okunur
// gösteriliyor) — atama, GÖREV 2'nin istediği TOPLU işlem olarak zaten
// danışan listesinde var (bkz. clients-table.tsx); aynı işlemi iki farklı
// yüzeyde (tekil + toplu) iki ayrı server action'la tutmak yerine tek bir
// giriş noktası (liste sayfası) bırakıldı.
export function GeneralTabForm({
  client,
  dietitians,
  onSave,
}: {
  client: ClientGeneralInfoModel
  dietitians: ClinicDietitianOption[]
  onSave: (values: ClientGeneralInfoFormValues) => Promise<{ success: boolean; error?: string }>
}) {
  const [formError, setFormError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ClientGeneralInfoFormValues>({
    resolver: zodResolver(clientGeneralInfoSchema),
    defaultValues: {
      firstName: client.firstName,
      lastName: client.lastName,
      birthDate: client.birthDate ?? '',
      sex: client.sex ?? SEX_NOT_SPECIFIED,
      phone: client.phone ?? '',
      email: client.email ?? '',
      occupation: client.occupation ?? '',
      referralSource: client.referralSource ?? '',
      notes: client.notes ?? '',
      status: client.status,
      smsConsentChecked: client.smsConsentAt !== null,
    },
  })

  const assignedDietitianName = dietitians.find(
    (dietitian) => dietitian.id === client.assignedDietitianId,
  )?.name

  async function onSubmit(values: ClientGeneralInfoFormValues) {
    setFormError(null)
    setSaved(false)
    const result = await onSave(values)
    if (!result.success) {
      setFormError(result.error ?? 'Kaydedilemedi, lütfen tekrar deneyin.')
      return
    }
    setSaved(true)
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="flex flex-col gap-6 border-y border-border py-5"
      aria-busy={isSubmitting}
    >
      <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
        <FieldRow label="Ad" htmlFor="firstName" error={errors.firstName?.message}>
          <Input
            className={underlinedControl}
            id="firstName"
            autoComplete="given-name"
            placeholder="—"
            aria-invalid={!!errors.firstName}
            {...register('firstName')}
          />
        </FieldRow>
        <FieldRow label="Soyad" htmlFor="lastName" error={errors.lastName?.message}>
          <Input
            className={underlinedControl}
            id="lastName"
            autoComplete="family-name"
            placeholder="—"
            aria-invalid={!!errors.lastName}
            {...register('lastName')}
          />
        </FieldRow>
        <FieldRow label="Doğum tarihi" htmlFor="birthDate" error={errors.birthDate?.message}>
          <Input
            className={underlinedControl}
            id="birthDate"
            type="date"
            aria-invalid={!!errors.birthDate}
            {...register('birthDate')}
          />
        </FieldRow>
        <FieldRow label="Cinsiyet" htmlFor="sex">
          <Controller
            control={control}
            name="sex"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="sex" className={`${underlinedControl} w-full`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEX_NOT_SPECIFIED}>Belirtilmedi</SelectItem>
                  {SEX_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FieldRow>
        <FieldRow label="Durum" htmlFor="status">
          <Controller
            control={control}
            name="status"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="status" className={`${underlinedControl} w-full`}>
                  <span className={`size-2 rounded-full ${statusDot(field.value)}`} />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FieldRow>
        <FieldRow label="Telefon" htmlFor="phone">
          <Input
            className={underlinedControl}
            id="phone"
            type="tel"
            autoComplete="tel"
            placeholder="—"
            {...register('phone')}
          />
        </FieldRow>
        <FieldRow label="E-posta" htmlFor="email" error={errors.email?.message}>
          <Input
            className={underlinedControl}
            id="email"
            type="email"
            autoComplete="email"
            placeholder="—"
            spellCheck={false}
            aria-invalid={!!errors.email}
            {...register('email')}
          />
        </FieldRow>
        <FieldRow label="Meslek" htmlFor="occupation">
          <Input
            className={underlinedControl}
            id="occupation"
            placeholder="—"
            {...register('occupation')}
          />
        </FieldRow>
        <FieldRow label="Nereden duydu" htmlFor="referralSource">
          <Input
            className={underlinedControl}
            id="referralSource"
            placeholder="—"
            {...register('referralSource')}
          />
        </FieldRow>
        <FieldRow label="Notlar" htmlFor="notes" className="sm:col-span-2 lg:col-span-3">
          <Textarea
            className="!min-h-24 !rounded-none !border-0 !border-b !border-border !bg-transparent !px-0 !shadow-none focus-visible:!border-primary focus-visible:!ring-0"
            id="notes"
            placeholder="—"
            rows={4}
            {...register('notes')}
          />
        </FieldRow>
      </div>

      <div className="flex flex-col gap-1.5">
        <Controller
          control={control}
          name="smsConsentChecked"
          render={({ field }) => (
            <label className="flex min-h-11 items-start gap-3 py-2 text-sm">
              <Checkbox
                checked={field.value}
                onCheckedChange={(checked) => field.onChange(checked === true)}
              />
              <span>Danışan, randevu hatırlatma SMS&apos;i almayı kabul ediyor.</span>
            </label>
          )}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Atanan diyetisyen</Label>
        <p className="text-sm text-muted-foreground">
          {assignedDietitianName ?? 'Henüz atanmadı'} —{' '}
          <NavigationLink href="/danisanlar" className="underline underline-offset-2">
            danışan listesinden
          </NavigationLink>{' '}
          toplu olarak değiştirilebilir.
        </p>
      </div>

      {formError && (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting ? 'Kaydediliyor…' : 'Kaydet'}
        </Button>
        {saved && (
          <span role="status" className="text-sm text-muted-foreground">
            Kaydedildi.
          </span>
        )}
      </div>
    </form>
  )
}

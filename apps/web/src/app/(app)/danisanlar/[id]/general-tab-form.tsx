'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import type { ClinicDietitianOption } from '@ogun/db/queries'
import type { clients } from '@ogun/db/schema'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  SEX_NOT_SPECIFIED,
  SEX_OPTIONS,
  STATUS_OPTIONS,
  clientGeneralInfoSchema,
  type ClientGeneralInfoFormValues,
} from '@/lib/validation/client-schemas'
import { updateClientGeneralInfoAction } from '../actions'

type ClientRow = typeof clients.$inferSelect

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
export function GeneralTabForm({ client, dietitians }: { client: ClientRow; dietitians: ClinicDietitianOption[] }) {
  const router = useRouter()
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
    },
  })

  const assignedDietitianName = dietitians.find((dietitian) => dietitian.id === client.assignedDietitianId)?.name

  async function onSubmit(values: ClientGeneralInfoFormValues) {
    setFormError(null)
    setSaved(false)
    const result = await updateClientGeneralInfoAction(client.id, values)
    if (!result.success) {
      setFormError(result.error ?? 'Kaydedilemedi, lütfen tekrar deneyin.')
      return
    }
    setSaved(true)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="firstName">Ad</Label>
          <Input id="firstName" aria-invalid={!!errors.firstName} {...register('firstName')} />
          {errors.firstName && <p className="text-sm text-destructive">{errors.firstName.message}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lastName">Soyad</Label>
          <Input id="lastName" aria-invalid={!!errors.lastName} {...register('lastName')} />
          {errors.lastName && <p className="text-sm text-destructive">{errors.lastName.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="birthDate">Doğum tarihi</Label>
          <Input id="birthDate" type="date" aria-invalid={!!errors.birthDate} {...register('birthDate')} />
          {errors.birthDate && <p className="text-sm text-destructive">{errors.birthDate.message}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sex">Cinsiyet</Label>
          <Controller
            control={control}
            name="sex"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="sex" className="w-full">
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
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="status">Durum</Label>
          <Controller
            control={control}
            name="status"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="status" className="w-full">
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
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phone">Telefon</Label>
          <Input id="phone" type="tel" {...register('phone')} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">E-posta</Label>
          <Input id="email" type="email" aria-invalid={!!errors.email} {...register('email')} />
          {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="occupation">Meslek</Label>
          <Input id="occupation" {...register('occupation')} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="referralSource">Nereden duydu</Label>
          <Input id="referralSource" {...register('referralSource')} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notes">Notlar</Label>
        <Textarea id="notes" rows={4} {...register('notes')} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Atanan diyetisyen</Label>
        <p className="text-sm text-muted-foreground">
          {assignedDietitianName ?? 'Henüz atanmadı'} —{' '}
          <Link href="/danisanlar" className="underline underline-offset-2">
            danışan listesinden
          </Link>{' '}
          toplu olarak değiştirilebilir.
        </p>
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

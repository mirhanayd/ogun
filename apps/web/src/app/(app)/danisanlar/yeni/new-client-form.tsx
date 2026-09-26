'use client'

import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SEX_NOT_SPECIFIED, SEX_OPTIONS, newClientSchema, type NewClientFormValues } from '@/lib/validation/client-schemas'

const DEFAULT_VALUES: NewClientFormValues = {
  firstName: '',
  lastName: '',
  phone: '',
  birthDate: '',
  sex: SEX_NOT_SPECIFIED,
  kvkkConsentChecked: false,
  explicitConsentChecked: false,
}

// GÖREV 3 — "tek sayfalık, hızlı" yeni danışan formu. Kaydettikten sonra
// doğrudan danışan detayına gider (router.push, aşağıda) — ayrı bir "başarılı"
// ekranı YOK, roadmap'in "15 saniyeden kısa" hedefiyle çelişmesin diye.
export function NewClientForm({
  onSave,
  onCreated,
}: {
  onSave: (values: NewClientFormValues) => Promise<{ success: boolean; clientId?: string; error?: string }>
  onCreated: (clientId: string) => void
}) {
  const [formError, setFormError] = useState<string | null>(null)
  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<NewClientFormValues>({
    resolver: zodResolver(newClientSchema),
    defaultValues: DEFAULT_VALUES,
  })

  async function onSubmit(values: NewClientFormValues) {
    setFormError(null)
    const result = await onSave(values)
    if (!result.success || !result.clientId) {
      setFormError(result.error ?? 'Kaydedilemedi, lütfen tekrar deneyin.')
      return
    }
    onCreated(result.clientId)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="mx-auto w-full max-w-3xl" aria-busy={isSubmitting}>
      <Card>
        <CardHeader className="border-b"><CardTitle>Danışan bilgileri</CardTitle><CardDescription>Ad ve soyad zorunludur. Diğer bilgileri daha sonra profilden tamamlayabilirsiniz.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="firstName">Ad</Label>
              <Input
                id="firstName"
                autoComplete="given-name"
                aria-invalid={!!errors.firstName}
                aria-describedby={errors.firstName ? 'firstName-error' : undefined}
                {...register('firstName')}
              />
              {errors.firstName && <p id="firstName-error" className="text-sm text-destructive">{errors.firstName.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lastName">Soyad</Label>
              <Input
                id="lastName"
                autoComplete="family-name"
                aria-invalid={!!errors.lastName}
                aria-describedby={errors.lastName ? 'lastName-error' : undefined}
                {...register('lastName')}
              />
              {errors.lastName && <p id="lastName-error" className="text-sm text-destructive">{errors.lastName.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone">Telefon</Label>
              <Input id="phone" type="tel" autoComplete="tel" {...register('phone')} />
            </div>
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
          </div>

          <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-sm font-medium">Rıza onayı</p>
            <Controller
              control={control}
              name="kvkkConsentChecked"
              render={({ field }) => (
                <label className="flex min-h-11 items-start gap-3 py-2 text-sm">
                  <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
                  <span>KVKK aydınlatma metnini okudum, kabul ediyorum.</span>
                </label>
              )}
            />
            {errors.kvkkConsentChecked && (
              <p className="text-sm text-destructive">{errors.kvkkConsentChecked.message}</p>
            )}
            <Controller
              control={control}
              name="explicitConsentChecked"
              render={({ field }) => (
                <label className="flex min-h-11 items-start gap-3 py-2 text-sm">
                  <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
                  <span>Özel nitelikli (sağlık) verimin işlenmesine açık rıza veriyorum.</span>
                </label>
              )}
            />
            {errors.explicitConsentChecked && (
              <p className="text-sm text-destructive">{errors.explicitConsentChecked.message}</p>
            )}
          </div>

          {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Kaydediliyor…' : 'Danışanı kaydet'}
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}

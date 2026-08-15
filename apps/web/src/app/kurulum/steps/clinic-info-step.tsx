'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { clinicInfoSchema, type ClinicInfoFormValues } from '@/lib/validation/onboarding-schemas'
import { saveClinicInfoAction } from '../actions'

export function ClinicInfoStep({
  defaultValues,
  onSaved,
}: {
  defaultValues: ClinicInfoFormValues
  onSaved: () => void
}) {
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ClinicInfoFormValues>({
    resolver: zodResolver(clinicInfoSchema),
    defaultValues,
  })

  async function onSubmit(values: ClinicInfoFormValues) {
    setFormError(null)
    const result = await saveClinicInfoAction(values)
    if (!result.success) {
      setFormError(result.error ?? 'Kaydedilemedi, lütfen tekrar deneyin.')
      return
    }
    onSaved()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Klinik bilgileri</CardTitle>
          <CardDescription>
            Kliniğinizin adı ve iletişim bilgileri — daha sonra Ayarlar&apos;dan düzenleyebilirsiniz.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Klinik adı</Label>
            <Input id="name" autoComplete="organization" aria-invalid={!!errors.name} {...register('name')} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone">Telefon</Label>
            <Input id="phone" type="tel" autoComplete="tel" aria-invalid={!!errors.phone} {...register('phone')} />
            {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="address">Adres</Label>
            <Textarea id="address" rows={3} aria-invalid={!!errors.address} {...register('address')} />
            {errors.address && <p className="text-sm text-destructive">{errors.address.message}</p>}
          </div>
          {formError && <p className="text-sm text-destructive">{formError}</p>}
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Kaydediliyor…' : 'Devam et'}
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}

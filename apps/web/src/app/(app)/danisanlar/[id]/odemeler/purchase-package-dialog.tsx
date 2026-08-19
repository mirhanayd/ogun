'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { toastActionError } from '@/lib/action-toast'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { purchasePackageFormSchema, type PurchasePackageFormValues } from '@/lib/validation/billing-schemas'
import { purchasePackageAction } from './actions'

export interface AvailablePackageOption {
  id: string
  name: string
  sessionCount: number
  price: string
}

export function PurchasePackageDialog({
  clientId,
  packages,
}: {
  clientId: string
  packages: AvailablePackageOption[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const {
    control,
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<PurchasePackageFormValues>({
    resolver: zodResolver(purchasePackageFormSchema),
    defaultValues: { packageId: '', price: '' },
  })

  const selectedPackageId = watch('packageId')

  useEffect(() => {
    const pkg = packages.find((row) => row.id === selectedPackageId)
    if (pkg) setValue('price', pkg.price)
  }, [selectedPackageId, packages, setValue])

  async function onSubmit(values: PurchasePackageFormValues) {
    const result = await purchasePackageAction(clientId, values)
    if (!result.success) {
      toastActionError(result.error ?? 'Paket satın alma kaydedilemedi.', 'Paketin hâlâ etkin olduğunu doğrulayıp tekrar deneyin; danışana bir seans yazılmadı.')
      return
    }
    toast.success('Paket satışı kaydedildi')
    setOpen(false)
    router.refresh()
  }

  if (packages.length === 0) {
    return (
      <Button size="sm" variant="outline" disabled title="Önce /finans sayfasından bir paket tanımı oluşturun">
        Paket sat
      </Button>
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Paket sat
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Paket satışı</DialogTitle>
          <DialogDescription>Danışana bir seans paketi satın, fiyatı gerekirse düzenleyin.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="packageId">Paket</Label>
            <Controller
              control={control}
              name="packageId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="packageId">
                    <SelectValue placeholder="Paket seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    {packages.map((pkg) => (
                      <SelectItem key={pkg.id} value={pkg.id}>
                        {pkg.name} ({pkg.sessionCount} seans)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.packageId && <p className="text-xs text-destructive">{errors.packageId.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="price">Fiyat (₺)</Label>
            <Input id="price" inputMode="decimal" {...register('price')} />
            {errors.price && <p className="text-xs text-destructive">{errors.price.message}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              İptal
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              Satışı kaydet
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

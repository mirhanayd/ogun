'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Package, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { toastActionError } from '@/lib/action-toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { EmptyState } from '@/components/empty-state'
import { packageFormSchema, type PackageFormValues } from '@/lib/validation/billing-schemas'
import { createPackageAction, setPackageActiveAction } from './actions'

export interface BillingPackageRow {
  id: string
  name: string
  sessionCount: number
  price: string
  validityDays: number | null
  isActive: boolean
}

// GitHub issue #40 / Prompt 7.2, GÖREV 1 — paket TANIMLARI yönetimi
// (/finans içinde, ayrı bir sayfa AÇILMADI — "basit tut" kuralı). Danışana
// paket SATIŞI burada değil, danışan detayının Ödemeler sekmesinde
// (bkz. danisanlar/[id]/odemeler/purchase-package-dialog.tsx).
export function PackageManager({ packages }: { packages: BillingPackageRow[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PackageFormValues>({
    resolver: zodResolver(packageFormSchema),
    defaultValues: { name: '', sessionCount: 8, price: '', validityDays: '' },
  })

  async function onSubmit(values: PackageFormValues) {
    const result = await createPackageAction(values)
    if (!result.success) {
      toastActionError(result.error ?? 'Paket oluşturulamadı.', 'Seans sayısı ve fiyatın sıfırdan büyük olduğundan emin olup tekrar deneyin.')
      return
    }
    toast.success('Paket oluşturuldu')
    reset()
    setOpen(false)
    router.refresh()
  }

  async function toggleActive(packageId: string, nextActive: boolean) {
    setBusyId(packageId)
    const result = await setPackageActiveAction(packageId, nextActive)
    setBusyId(null)
    if (!result.success) {
      toastActionError(result.error ?? 'Paket güncellenemedi.', 'Sayfayı yenileyip tekrar deneyin; paketin durumu değişmedi.')
      return
    }
    router.refresh()
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Paketler</CardTitle>
          <CardDescription>Danışanlara satılabilir seans paketi tanımları.</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="size-4" />
              Yeni paket
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Yeni paket tanımı</DialogTitle>
              <DialogDescription>Seans sayısı, fiyat ve geçerlilik süresini girin.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name">Paket adı</Label>
                <Input id="name" placeholder="Ör. 8 seanslık kilo yönetimi paketi" {...register('name')} />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="sessionCount">Seans sayısı</Label>
                  <Input id="sessionCount" type="number" min={1} {...register('sessionCount')} />
                  {errors.sessionCount && <p className="text-xs text-destructive">{errors.sessionCount.message}</p>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="price">Fiyat (₺)</Label>
                  <Input id="price" inputMode="decimal" {...register('price')} />
                  {errors.price && <p className="text-xs text-destructive">{errors.price.message}</p>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="validityDays">Geçerlilik (gün)</Label>
                  <Input id="validityDays" placeholder="Süresiz" {...register('validityDays')} />
                  {errors.validityDays && <p className="text-xs text-destructive">{errors.validityDays.message}</p>}
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  İptal
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  Oluştur
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {packages.length === 0 ? (
          <EmptyState
            variant="inline"
            icon={Package}
            title="Henüz paket tanımı yok"
            description='Örneğin "8 seans takip paketi" tanımlayın; danışan kartındaki Ödemeler sekmesinden tek tıkla satabilirsiniz.'
          />
        ) : (
          <div className="flex flex-col gap-2">
            {packages.map((pkg) => (
              <div key={pkg.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
                <div>
                  <p className="font-medium">{pkg.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {pkg.sessionCount} seans · {Number(pkg.price).toLocaleString('tr-TR')} ₺
                    {pkg.validityDays ? ` · ${pkg.validityDays} gün geçerli` : ' · süresiz'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={pkg.isActive ? 'secondary' : 'outline'}>{pkg.isActive ? 'Aktif' : 'Pasif'}</Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === pkg.id}
                    onClick={() => toggleActive(pkg.id, !pkg.isActive)}
                  >
                    {pkg.isActive ? 'Pasifleştir' : 'Aktifleştir'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

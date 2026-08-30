'use client'

import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { CalendarClock, CircleDollarSign, Package, PackageCheck, Plus } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { EmptyState } from '@/components/empty-state'
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
import { toastActionError } from '@/lib/action-toast'
import { packageFormSchema, type PackageFormValues } from '@/lib/validation/billing-schemas'

export interface BillingPackageRow {
  id: string
  name: string
  sessionCount: number
  price: string
  validityDays: number | null
  isActive: boolean
}

// Paket tanımları burada yönetilir; danışana paket satışı danışan detayındaki
// Ödemeler sekmesinde kalır. Bu ayrım finans ekranını katalog yönetiminde tutar.
export function PackageManager({ packages, onCreate, onSetActive }: { packages: BillingPackageRow[]; onCreate: (values: PackageFormValues) => Promise<{ success: boolean; error?: string }>; onSetActive: (id: string, active: boolean) => Promise<{ success: boolean; error?: string }> }) {
  const [open, setOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const activeCount = packages.filter((item) => item.isActive).length

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
    const result = await onCreate(values)
    if (!result.success) {
      toastActionError(
        result.error ?? 'Paket oluşturulamadı.',
        'Seans sayısı ve fiyatın sıfırdan büyük olduğundan emin olup tekrar deneyin.',
      )
      return
    }
    toast.success('Paket oluşturuldu')
    reset()
    setOpen(false)
  }

  async function toggleActive(packageId: string, nextActive: boolean) {
    setBusyId(packageId)
    const result = await onSetActive(packageId, nextActive)
    setBusyId(null)
    if (!result.success) {
      toastActionError(
        result.error ?? 'Paket güncellenemedi.',
        'Sayfayı yenileyip tekrar deneyin; paketin durumu değişmedi.',
      )
      return
    }
  }

  return (
    <Card className="h-full border-border/70 bg-card/90 shadow-sm shadow-foreground/[0.03]">
      <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-border/60 px-5 pb-4 sm:px-6">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base tracking-tight">Seans paketleri</CardTitle>
            {packages.length > 0 && (
              <Badge variant="secondary">
                {activeCount}/{packages.length} aktif
              </Badge>
            )}
          </div>
          <CardDescription>Danışanlara atanabilen paket kataloğu</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="shrink-0 rounded-lg">
              <Plus data-icon="inline-start" />
              Yeni paket
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Yeni seans paketi</DialogTitle>
              <DialogDescription>
                Kliniğinizin satışa açacağı seans sayısı, fiyat ve geçerlilik süresini belirleyin.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="package-name">Paket adı</Label>
                <Input
                  id="package-name"
                  placeholder="Ör. 8 seanslık kilo yönetimi paketi"
                  autoComplete="off"
                  {...register('name')}
                />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="package-session-count">Seans</Label>
                  <Input
                    id="package-session-count"
                    type="number"
                    min={1}
                    {...register('sessionCount')}
                  />
                  {errors.sessionCount && (
                    <p className="text-xs text-destructive">{errors.sessionCount.message}</p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="package-price">Fiyat (₺)</Label>
                  <Input id="package-price" inputMode="decimal" {...register('price')} />
                  {errors.price && (
                    <p className="text-xs text-destructive">{errors.price.message}</p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="package-validity">Geçerlilik</Label>
                  <Input
                    id="package-validity"
                    inputMode="numeric"
                    placeholder="Gün"
                    {...register('validityDays')}
                  />
                  {errors.validityDays && (
                    <p className="text-xs text-destructive">{errors.validityDays.message}</p>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  İptal
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Oluşturuluyor…' : 'Paketi oluştur'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="px-5 sm:px-6">
        {packages.length === 0 ? (
          <EmptyState
            variant="inline"
            icon={Package}
            title="Paket kataloğu boş"
            description="Takip sürecinize uygun ilk seans paketini oluşturun; ardından danışan kartından atayın."
            className="min-h-64"
          />
        ) : (
          <ul className="divide-y divide-border/60">
            {packages.map((pkg) => (
              <li key={pkg.id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <span
                    className={`flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 ${
                      pkg.isActive
                        ? 'bg-primary/10 text-primary ring-primary/15'
                        : 'bg-muted text-muted-foreground ring-border/70'
                    }`}
                  >
                    <PackageCheck className="size-4.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="truncate text-sm font-semibold">{pkg.name}</p>
                      <Badge variant={pkg.isActive ? 'secondary' : 'outline'}>
                        {pkg.isActive ? 'Aktif' : 'Pasif'}
                      </Badge>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Package className="size-3" />
                        {pkg.sessionCount} seans
                      </span>
                      <span className="inline-flex items-center gap-1 font-medium text-foreground/75 tabular-nums">
                        <CircleDollarSign className="size-3" />
                        {Number(pkg.price).toLocaleString('tr-TR')} ₺
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="size-3" />
                        {pkg.validityDays ? `${pkg.validityDays} gün` : 'Süresiz'}
                      </span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="self-end text-muted-foreground sm:self-auto"
                    disabled={busyId === pkg.id}
                    aria-busy={busyId === pkg.id}
                    onClick={() => toggleActive(pkg.id, !pkg.isActive)}
                  >
                    {busyId === pkg.id
                      ? 'Güncelleniyor…'
                      : pkg.isActive
                        ? 'Pasife al'
                        : 'Aktifleştir'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

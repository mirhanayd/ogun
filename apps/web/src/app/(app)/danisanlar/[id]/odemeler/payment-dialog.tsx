'use client'

import { useState } from 'react'
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
import { Textarea } from '@/components/ui/textarea'
import { PAYMENT_METHOD_OPTIONS, paymentFormSchema, type PaymentFormValues } from '@/lib/validation/billing-schemas'
import { createPaymentAction } from './actions'

export interface ClientPackageOption {
  id: string
  packageName: string
}

// GitHub issue #40 / Prompt 7.2, GÖREV 2 + GÖREV 4 — ödeme kaydı formu.
// Seri/sıra no OPSİYONEL (bkz. billing-schemas.ts): girilirse actions.ts
// lib/invoicing üzerinden "manuel" sağlayıcıya kesim tarihini damgalatır.
export function PaymentDialog({
  clientId,
  clientPackages,
}: {
  clientId: string
  clientPackages: ClientPackageOption[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: {
      clientPackageId: '',
      amount: '',
      method: 'nakit',
      paidAt: new Date().toISOString().slice(0, 10),
      notes: '',
      receiptSeries: '',
      receiptSequenceNumber: '',
    },
  })

  async function onSubmit(values: PaymentFormValues) {
    const result = await createPaymentAction(clientId, values)
    if (!result.success) {
      toastActionError(result.error ?? 'Ödeme kaydedilemedi.', 'Tutar ve tarih alanlarını kontrol edip tekrar kaydedin; ödeme henüz işlenmedi.')
      return
    }
    toast.success('Ödeme kaydedildi')
    reset({
      clientPackageId: '',
      amount: '',
      method: 'nakit',
      paidAt: new Date().toISOString().slice(0, 10),
      notes: '',
      receiptSeries: '',
      receiptSequenceNumber: '',
    })
    setOpen(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Ödeme al</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ödeme kaydı</DialogTitle>
          <DialogDescription>Tahsilat bilgilerini girin — makbuz alanları opsiyoneldir.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="amount">Tutar (₺)</Label>
              <Input id="amount" inputMode="decimal" {...register('amount')} />
              {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="method">Yöntem</Label>
              <Controller
                control={control}
                name="method"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="method">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHOD_OPTIONS.map((option) => (
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

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="paidAt">Tarih</Label>
              <Input id="paidAt" type="date" {...register('paidAt')} />
              {errors.paidAt && <p className="text-xs text-destructive">{errors.paidAt.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="clientPackageId">İlişkili paket</Label>
              <Controller
                control={control}
                name="clientPackageId"
                render={({ field }) => (
                  <Select value={field.value || 'none'} onValueChange={(value) => field.onChange(value === 'none' ? '' : value)}>
                    <SelectTrigger id="clientPackageId">
                      <SelectValue placeholder="Paket dışı" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Paket dışı</SelectItem>
                      {clientPackages.map((pkg) => (
                        <SelectItem key={pkg.id} value={pkg.id}>
                          {pkg.packageName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="receiptSeries">Makbuz seri (opsiyonel)</Label>
              <Input id="receiptSeries" {...register('receiptSeries')} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="receiptSequenceNumber">Sıra no (opsiyonel)</Label>
              <Input id="receiptSequenceNumber" {...register('receiptSequenceNumber')} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Not</Label>
            <Textarea id="notes" rows={2} {...register('notes')} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              İptal
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              Kaydet
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

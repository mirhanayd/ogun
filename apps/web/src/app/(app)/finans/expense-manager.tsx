'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Receipt, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { toastActionError } from '@/lib/action-toast'
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
import { expenseFormSchema, type ExpenseFormValues } from '@/lib/validation/billing-schemas'
import { createExpenseAction, deleteExpenseAction } from './actions'

export interface ExpenseRow {
  id: string
  category: string
  amount: string
  date: string
  description: string | null
}

// GitHub issue #40 / Prompt 7.2, GÖREV 1 — "basit gider takibi (muhasebe
// programı değiliz)": sabit bir kategori sözlüğü YOK (serbest metin), belge
// eki YOK. Sadece o AYIN giderleri gösterilir (page.tsx zaten aralığa göre
// filtrelenmiş listeyi geçiyor).
export function ExpenseManager({ expenses, monthLabel }: { expenses: ExpenseRow[]; monthLabel: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: { category: '', amount: '', date: new Date().toISOString().slice(0, 10), description: '' },
  })

  async function onSubmit(values: ExpenseFormValues) {
    const result = await createExpenseAction(values)
    if (!result.success) {
      toastActionError(result.error ?? 'Gider kaydedilemedi.', 'Tutar, kategori ve tarih alanlarını kontrol edip tekrar kaydedin.')
      return
    }
    toast.success('Gider kaydedildi')
    reset({ category: '', amount: '', date: new Date().toISOString().slice(0, 10), description: '' })
    setOpen(false)
    router.refresh()
  }

  async function handleDelete(expenseId: string) {
    setBusyId(expenseId)
    const result = await deleteExpenseAction(expenseId)
    setBusyId(null)
    if (!result.success) {
      toastActionError(result.error ?? 'Gider silinemedi.', 'Kayıt başka bir sekmede silinmiş olabilir; sayfayı yenileyin.')
      return
    }
    router.refresh()
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Giderler</CardTitle>
          <CardDescription>{monthLabel} — basit gider takibi.</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="size-4" />
              Yeni gider
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Yeni gider</DialogTitle>
              <DialogDescription>Kategori, tutar ve tarih girin.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="category">Kategori</Label>
                <Input id="category" placeholder="Ör. Kira, malzeme, pazarlama" {...register('category')} />
                {errors.category && <p className="text-xs text-destructive">{errors.category.message}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="amount">Tutar (₺)</Label>
                  <Input id="amount" inputMode="decimal" {...register('amount')} />
                  {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="date">Tarih</Label>
                  <Input id="date" type="date" {...register('date')} />
                  {errors.date && <p className="text-xs text-destructive">{errors.date.message}</p>}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="description">Açıklama</Label>
                <Input id="description" {...register('description')} />
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
      </CardHeader>
      <CardContent>
        {expenses.length === 0 ? (
          <EmptyState
            variant="inline"
            icon={Receipt}
            title="Bu ay gider kaydı yok"
            description="Kira, malzeme veya abonelik giderlerinizi girdiğinizde net kâr hesabına dahil edilir."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {expenses.map((expense) => (
              <div key={expense.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
                <div>
                  <p className="font-medium">{expense.category}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(expense.date).toLocaleDateString('tr-TR')}
                    {expense.description ? ` · ${expense.description}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{Number(expense.amount).toLocaleString('tr-TR')} ₺</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={busyId === expense.id}
                    onClick={() => handleDelete(expense.id)}
                    aria-label="Gideri sil"
                  >
                    <Trash2 className="size-4" />
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

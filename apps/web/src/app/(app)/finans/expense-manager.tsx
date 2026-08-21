'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { CalendarDays, Plus, Receipt, Tag, Trash2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { EmptyState } from '@/components/empty-state'
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
import { expenseFormSchema, type ExpenseFormValues } from '@/lib/validation/billing-schemas'
import { createExpenseAction, deleteExpenseAction } from './actions'

export interface ExpenseRow {
  id: string
  category: string
  amount: string
  date: string
  description: string | null
}

// Finans ekranı basit klinik gider takibi sunar: kategori serbest metindir ve
// yalnızca seçili aya ait kayıtlar üst sayfadaki nakit akışına dahil edilir.
export function ExpenseManager({
  expenses,
  monthLabel,
}: {
  expenses: ExpenseRow[]
  monthLabel: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const totalExpense = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      category: '',
      amount: '',
      date: new Date().toISOString().slice(0, 10),
      description: '',
    },
  })

  async function onSubmit(values: ExpenseFormValues) {
    const result = await createExpenseAction(values)
    if (!result.success) {
      toastActionError(
        result.error ?? 'Gider kaydedilemedi.',
        'Tutar, kategori ve tarih alanlarını kontrol edip tekrar kaydedin.',
      )
      return
    }
    toast.success('Gider kaydedildi')
    reset({
      category: '',
      amount: '',
      date: new Date().toISOString().slice(0, 10),
      description: '',
    })
    setOpen(false)
    router.refresh()
  }

  async function handleDelete(expenseId: string) {
    setBusyId(expenseId)
    const result = await deleteExpenseAction(expenseId)
    setBusyId(null)
    if (!result.success) {
      toastActionError(
        result.error ?? 'Gider silinemedi.',
        'Kayıt başka bir sekmede silinmiş olabilir; sayfayı yenileyin.',
      )
      return
    }
    router.refresh()
  }

  return (
    <Card className="h-full border-border/70 bg-card/90 shadow-sm shadow-foreground/[0.03]">
      <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-border/60 px-5 pb-4 sm:px-6">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <CardTitle className="text-base tracking-tight">Dönem giderleri</CardTitle>
            {expenses.length > 0 && (
              <span className="text-sm font-semibold text-rose-700 tabular-nums dark:text-rose-300">
                {totalExpense.toLocaleString('tr-TR')} ₺
              </span>
            )}
          </div>
          <CardDescription className="capitalize">
            {monthLabel} içinde kaydedilen kalemler
          </CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="shrink-0 rounded-lg">
              <Plus data-icon="inline-start" />
              Yeni gider
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Yeni gider kaydı</DialogTitle>
              <DialogDescription>
                Klinik giderini seçtiğiniz tarihteki aylık nakit akışına ekleyin.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="expense-category">Kategori</Label>
                <Input
                  id="expense-category"
                  placeholder="Ör. Kira, sarf malzeme, pazarlama"
                  autoComplete="off"
                  {...register('category')}
                />
                {errors.category && (
                  <p className="text-xs text-destructive">{errors.category.message}</p>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="expense-amount">Tutar (₺)</Label>
                  <Input id="expense-amount" inputMode="decimal" {...register('amount')} />
                  {errors.amount && (
                    <p className="text-xs text-destructive">{errors.amount.message}</p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="expense-date">Tarih</Label>
                  <Input id="expense-date" type="date" {...register('date')} />
                  {errors.date && <p className="text-xs text-destructive">{errors.date.message}</p>}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="expense-description">Açıklama</Label>
                <Input
                  id="expense-description"
                  placeholder="İsteğe bağlı not"
                  {...register('description')}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  İptal
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Kaydediliyor…' : 'Gideri kaydet'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="px-5 sm:px-6">
        {expenses.length === 0 ? (
          <EmptyState
            variant="inline"
            icon={Receipt}
            title="Bu dönemde gider yok"
            description="Kira, sarf malzeme veya işletme giderleri eklendiğinde net nakit akışına yansır."
            className="min-h-64"
          />
        ) : (
          <ul className="divide-y divide-border/60">
            {expenses.map((expense) => (
              <li key={expense.id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-700 ring-1 ring-rose-500/15 dark:text-rose-300">
                    <Receipt className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-baseline justify-between gap-3">
                      <p className="truncate text-sm font-semibold">{expense.category}</p>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">
                        {Number(expense.amount).toLocaleString('tr-TR')} ₺
                      </span>
                    </div>
                    <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <time dateTime={expense.date} className="inline-flex items-center gap-1">
                        <CalendarDays className="size-3" />
                        {new Date(expense.date).toLocaleDateString('tr-TR')}
                      </time>
                      {expense.description && (
                        <span className="inline-flex min-w-0 items-center gap-1">
                          <Tag className="size-3 shrink-0" />
                          <span className="truncate">{expense.description}</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    disabled={busyId === expense.id}
                    aria-busy={busyId === expense.id}
                    onClick={() => handleDelete(expense.id)}
                    aria-label={`${expense.category} giderini sil`}
                  >
                    <Trash2 />
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

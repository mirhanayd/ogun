'use client'

import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createSavedMealAction } from '@/app/(app)/planlar/actions'

// GitHub issue #27 / Prompt 5.5, GÖREV 3 — meal-block.tsx'teki "kaydet"
// ikonunun açtığı küçük diyalog: sadece bir ad (ve opsiyonel not) ister,
// createSavedMealAction'ı çağırır. Öğün TÜRÜ ve kalemler zaten sunucu
// tarafında kaynak öğünden kopyalanıyor (bkz. queries/saved-meals.ts
// createSavedMealFromMeal) — burada TEKRAR seçtirilmiyor.
export function SaveMealDialog({
  mealId,
  defaultName,
  open,
  onOpenChange,
}: {
  mealId: string
  defaultName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [name, setName] = useState(defaultName)
  const [notes, setNotes] = useState('')
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (open) setName(defaultName)
  }, [open, defaultName])

  function handleSubmit() {
    startTransition(async () => {
      const result = await createSavedMealAction({
        mealId,
        name,
        notes: notes.trim() === '' ? null : notes,
      })
      if (!result.success) {
        toast.error(result.error ?? 'Kayıtlı öğün oluşturulamadı.')
        return
      }
      toast.success('Öğün, kayıtlı öğünler kütüphanesine eklendi.', {
        description: 'Bu öğünü başka planlarda "@" ile arayarak ekleyebilirsiniz.',
      })
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Öğünü kütüphaneye kaydet</DialogTitle>
          <DialogDescription>
            Bu öğün, sık kullandığınız bir kombinasyon olarak kaydedilir; sonra herhangi bir
            plandaki arama kutusunda &quot;@&quot; yazarak yeniden ekleyebilirsiniz.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="saved-meal-name">Ad</Label>
            <Input
              id="saved-meal-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='ör. "Standart kahvaltı"'
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="saved-meal-notes">Not (opsiyonel)</Label>
            <Input
              id="saved-meal-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ör. protein ağırlıklı"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Vazgeç
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || name.trim() === ''}>
            Kaydet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

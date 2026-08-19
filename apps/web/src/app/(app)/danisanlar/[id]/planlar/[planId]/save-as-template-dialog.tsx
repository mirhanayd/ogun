'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
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
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PLAN_TEMPLATE_CATEGORY_OPTIONS } from '@/lib/validation/plan-schemas'
import type { PlanTemplateCategory } from '@ogun/db/schema'
import { saveAsTemplateAction } from '@/app/(app)/planlar/actions'

// GitHub issue #27 / Prompt 5.5, GÖREV 1 — "Mevcut planı şablona dönüştür".
// #23'ün saveAsTemplateAction'ını ÇAĞIRIR (bkz. actions.ts) — burada sadece
// kategori/ad girdisini toplayan UI var, klonlama mantığı queries/plans.ts'te
// zaten hazır.
export function SaveAsTemplateDialog({
  planId,
  currentPlanName,
  open,
  onOpenChange,
}: {
  planId: string
  currentPlanName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [name, setName] = useState(`${currentPlanName} şablonu`)
  const [category, setCategory] = useState<PlanTemplateCategory>('genel')
  const [isPending, startTransition] = useTransition()

  function handleSubmit() {
    startTransition(async () => {
      const result = await saveAsTemplateAction(planId, category, name.trim() || undefined)
      if (!result.success) {
        toastActionError(result.error ?? 'Şablon oluşturulamadı.', 'Şablon adının boş olmadığından emin olup tekrar deneyin; plan olduğu gibi duruyor.')
        return
      }
      toast.success('Plan şablon olarak kaydedildi.', {
        description: 'Şablon kütüphanesinde görüntüleyebilirsiniz.',
        action: {
          label: 'Şablonlara git',
          onClick: () => router.push('/planlar/sablonlar'),
        },
      })
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Şablona dönüştür</DialogTitle>
          <DialogDescription>
            Bu planın bir KOPYASI, danışansız bir şablon olarak kaydedilir — mevcut plan
            değişmez.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="template-name">Şablon adı</Label>
            <Input id="template-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="template-category">Kategori</Label>
            <Select
              value={category}
              onValueChange={(value) => setCategory(value as PlanTemplateCategory)}
            >
              <SelectTrigger id="template-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLAN_TEMPLATE_CATEGORY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Vazgeç
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || name.trim() === ''}>
            Şablon olarak kaydet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

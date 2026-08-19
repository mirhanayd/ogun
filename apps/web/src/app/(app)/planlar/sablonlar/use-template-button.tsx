'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Sparkles } from 'lucide-react'
import { toastActionError } from '@/lib/action-toast'
import { Button } from '@/components/ui/button'
import { clonePlanAction } from '@/app/(app)/planlar/actions'
import { ClientPickerDialog } from './client-picker-dialog'

// GitHub issue #27 / Prompt 5.5, GÖREV 1 — "'Bu şablondan plan oluştur' →
// danışan seç → düzenlemeye git". clonePlanAction (#23'ün genel amaçlı
// klonlama action'ı, bkz. planlar/actions.ts dosya başı notu) targetClientId
// verildiğinde şablonun (isTemplate=true) bir kopyasını o danışan için
// isTemplate=false olarak üretir — bu da queries/plans.ts'teki
// templateUsageCount sayacını artırır (bkz. o dosyadaki not).
export function UseTemplateButton({ templateId }: { templateId: string }) {
  const router = useRouter()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSelectClient(clientId: string) {
    startTransition(async () => {
      const result = await clonePlanAction(templateId, clientId)
      if (!result.success || !result.data) {
        toastActionError(result.error ?? 'Plan oluşturulamadı.', 'Şablon silinmiş ya da danışan arşivlenmiş olabilir; listeyi yenileyip tekrar deneyin.')
        return
      }
      router.push(`/danisanlar/${clientId}/planlar/${result.data.id}`)
    })
  }

  return (
    <>
      <Button
        size="sm"
        className="gap-1.5"
        disabled={isPending}
        onClick={() => setPickerOpen(true)}
      >
        {isPending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Sparkles className="size-3.5" />
        )}
        Bu şablondan plan oluştur
      </Button>
      <ClientPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={handleSelectClient}
      />
    </>
  )
}

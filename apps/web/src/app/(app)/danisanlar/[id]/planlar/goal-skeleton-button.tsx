'use client'

import { useState } from 'react'
import { Target } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { GoalSkeletonDialog } from './goal-skeleton-dialog'

// GitHub issue #27 / Prompt 5.5, GÖREV 4 — planlar-tab.tsx (sunucu bileşeni)
// içinden dialog state'ini tutan istemci kabuğu. new-plan-button.tsx ile AYNI
// yerleşimde, "Yeni plan"ın yanında ikinci bir giriş noktası.
export function GoalSkeletonButton({
  clientId,
  defaultTargetKcal,
}: {
  clientId: string
  defaultTargetKcal: number | null
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Target className="size-4" />
        Hedeften oluştur
      </Button>
      <GoalSkeletonDialog
        clientId={clientId}
        defaultTargetKcal={defaultTargetKcal}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}

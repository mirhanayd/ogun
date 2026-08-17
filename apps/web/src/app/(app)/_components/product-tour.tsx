'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { trackEvent } from '@/lib/analytics/track'
import { completeProductTourAction } from './onboarding-actions'

// GitHub issue #47 / Prompt 8.3, GÖREV 1 — "İlk girişte 4 adımlı ürün turu
// (plan editörüne odaklı)". Bu bir sayfa-üstü (spotlight/overlay) tur
// DEĞİL — o, editörün gerçek DOM yapısına sıkı sıkıya bağlı bir kütüphane
// gerektirirdi (ör. bir "driver.js" benzeri bağımlılık) ve plan editörü
// zaten karmaşık (bkz. plan-editor.tsx) bir bileşen; bunun yerine 4 adımlı
// BİLGİLENDİRİCİ bir diyalog dizisi — her adım plan editörünün GERÇEK bir
// özelliğini (öğün ekleme, besin arama/Tab-Enter akışı, hedef iskelet
// sihirbazı, PDF/paylaşım) doğru terimlerle anlatıyor. Uydurma bir "tıkla
// buraya" akışı yerine bilgilendirme + "anladım" tercih edildi.
const TOUR_STEPS = [
  {
    title: '1/4 — Danışan ve plan',
    body: 'Her diyet planı bir danışana bağlıdır. Bir danışanın "Planlar" sekmesinden "Yeni plan" ile başlayın, ya da "Hedeften oluştur" ile hedef kaloriden otomatik bir iskelet üretin.',
  },
  {
    title: '2/4 — Öğün ve besin ekleme',
    body: 'Plan editöründe her öğüne Ctrl/Cmd+K ile besin arayıp ekleyebilirsiniz — arama tamamen çevrimdışı çalışır, sonuç anında gelir.',
  },
  {
    title: '3/4 — Hızlı düzenleme',
    body: 'Bir besinin miktarına tıklayın, düzenleyin, Enter veya Tab ile kaydedip sıradaki alana geçin — Esc ile vazgeçebilirsiniz.',
  },
  {
    title: '4/4 — Paylaşım ve PDF',
    body: 'Plan hazır olduğunda üst kısımdaki paylaşım/PDF seçenekleriyle danışanla paylaşabilir, markalı bir PDF olarak indirebilirsiniz.',
  },
]

export function ProductTour() {
  const router = useRouter()
  const [open, setOpen] = useState(true)
  const [stepIndex, setStepIndex] = useState(0)
  const [, startTransition] = useTransition()

  function finish(eventName: 'product_tour_completed' | 'product_tour_skipped') {
    setOpen(false)
    startTransition(async () => {
      await completeProductTourAction()
      trackEvent({ eventName })
      router.refresh()
    })
  }

  const step = TOUR_STEPS[stepIndex]!
  const isLastStep = stepIndex === TOUR_STEPS.length - 1

  return (
    <Dialog open={open} onOpenChange={(next) => !next && finish('product_tour_skipped')}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{step.title}</DialogTitle>
          <DialogDescription>{step.body}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="justify-between sm:justify-between">
          <Button variant="ghost" onClick={() => finish('product_tour_skipped')}>
            Turu atla
          </Button>
          <Button
            onClick={() => {
              if (isLastStep) {
                finish('product_tour_completed')
                return
              }
              setStepIndex((prev) => prev + 1)
            }}
          >
            {isLastStep ? 'Anladım, başla' : 'İleri'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

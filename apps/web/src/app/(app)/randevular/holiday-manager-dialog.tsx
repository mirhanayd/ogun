'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { toastActionError } from '@/lib/action-toast'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createHolidayAction, deleteHolidayAction } from './actions'

export interface HolidayRow {
  id: string
  date: string
  description: string | null
}

// GitHub issue #39 / Prompt 7.1, GÖREV 1/3 — clinic_holidays yönetimi.
// Ayrı bir /ayarlar alt sayfası AÇILMADI (ayarlar/page.tsx henüz salt-okunur
// bir özet, bkz. o dosyanın üstündeki not "Düzenleme bu issue'nun kapsamı
// DIŞINDA") — bunun yerine takvimin İÇİNDE küçük bir dialog: tatiller zaten
// SADECE randevu müsaitlik hesabında kullanılıyor, bu yüzden yönetimi de
// aynı ekranda tutmak (ayrı bir sayfaya gitmek yerine) daha az sürtünme.
export function HolidayManagerDialog({
  open,
  onOpenChange,
  holidays,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  holidays: HolidayRow[]
}) {
  const router = useRouter()
  const [date, setDate] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleAdd() {
    if (!date) return
    setBusy(true)
    const result = await createHolidayAction(date, description)
    setBusy(false)
    if (!result.success) {
      toastActionError(result.error ?? 'Tatil eklenemedi.', 'Tarihin başka bir tatille çakışmadığından emin olup tekrar deneyin.')
      return
    }
    setDate('')
    setDescription('')
    router.refresh()
  }

  async function handleDelete(id: string) {
    const result = await deleteHolidayAction(id)
    if (!result.success) {
      toastActionError(result.error ?? 'Tatil silinemedi.', 'Sayfayı yenileyip tekrar deneyin; takvimdeki tatil kaldırılmadı.')
      return
    }
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Klinik tatilleri</DialogTitle>
          <DialogDescription>
            Bu tarihlerde randevu formu çalışma saati dışı uyarısı gösterir.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="holiday-date">Tarih</Label>
            <Input id="holiday-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="holiday-description">Açıklama</Label>
            <Input
              id="holiday-description"
              placeholder="Ör. Ramazan Bayramı"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <Button type="button" onClick={handleAdd} disabled={busy || !date}>
            Ekle
          </Button>
        </div>

        <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
          {holidays.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">Henüz tatil eklenmedi.</p>
          )}
          {holidays.map((holiday) => (
            <div
              key={holiday.id}
              className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium">
                  {new Date(`${holiday.date}T00:00:00`).toLocaleDateString('tr-TR', {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                  })}
                </p>
                {holiday.description && <p className="text-xs text-muted-foreground">{holiday.description}</p>}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => handleDelete(holiday.id)}
                aria-label="Tatili sil"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

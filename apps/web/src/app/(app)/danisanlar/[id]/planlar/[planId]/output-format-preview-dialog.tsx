'use client'

import { useEffect, useState } from 'react'
import { FileText, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { GroupEquivalentsRow } from '@ogun/nutrition-core'
import { buildExchangeEquivalentsPreviewAction } from '@/app/(app)/planlar/exchange-actions'
import { convertItemToExchange } from '@/lib/plan-exchanges'
import type { FoodMacroLookup } from '@/lib/plan-nutrients'
import { usePlanEditorStore, useFoodExchangeMap, type DraftDay } from './plan-editor-store'

// GitHub issue #28 / Prompt 5.6 — GÖREV 4: "PDF'te iki format seçeneği...
// Değişim formatında sonda grup eşdeğer tablosu bassın." Bu bileşen GERÇEK
// bir PDF ÜRETMEZ — roadmap Prompt 6.1'in (packages/pdf, @react-pdf/renderer)
// kapsamı bu issue'da BİLEREK DIŞARIDA bırakıldı (o paket bu repoda henüz
// YOK). Burada sadece "çıktı hazır olsaydı ne gösterirdi" önizlemesi/demo'su
// var — dialog başlığı ve içindeki not bunu AÇIKÇA söylüyor.
export function OutputFormatPreviewDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const outputFormat = usePlanEditorStore((s) => s.outputFormat)
  const days = usePlanEditorStore((s) => s.days)
  const foodMacros = usePlanEditorStore((s) => s.foodMacros)
  const allergies = usePlanEditorStore((s) => s.allergies)
  const intolerances = usePlanEditorStore((s) => s.intolerances)
  const foodExchangeMap = useFoodExchangeMap()

  const [equivalents, setEquivalents] = useState<GroupEquivalentsRow[] | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')

  useEffect(() => {
    if (!open || outputFormat !== 'değişim_listesi') return
    let cancelled = false
    setStatus('loading')
    buildExchangeEquivalentsPreviewAction({ allergies, intolerances })
      .then((result) => {
        if (cancelled) return
        if (!result.success || !result.data) {
          setStatus('error')
          return
        }
        setEquivalents(result.data)
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [open, outputFormat, allergies, intolerances])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-4" />
            Çıktı önizlemesi (demo)
          </DialogTitle>
          <DialogDescription>
            Bu, seçili çıktı formatının (&ldquo;
            {outputFormat === 'değişim_listesi' ? 'değişim listesi + eşdeğerler tablosu' : 'besin listesi'}
            &rdquo;) verisinin nasıl göründüğünün bir önizlemesidir — gerçek PDF üretimi henüz
            YOK (roadmap Prompt 6.1&apos;in kapsamı). Bu ekran o zaman kullanılacak veriyi
            ŞİMDİDEN hazırlar.
          </DialogDescription>
        </DialogHeader>

        {outputFormat === 'besin_listesi' ? (
          <FoodListPreview days={days} foodMacros={foodMacros} />
        ) : (
          <div className="flex flex-col gap-4">
            <ExchangeListPreview days={days} foodExchangeMap={foodExchangeMap} />
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">Grup eşdeğerleri tablosu</h3>
              {status === 'loading' && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  Hazırlanıyor…
                </div>
              )}
              {status === 'error' && (
                <p className="text-xs text-destructive">Eşdeğerler tablosu hazırlanamadı.</p>
              )}
              {status === 'ready' && equivalents && (
                <ul className="flex flex-col gap-2">
                  {equivalents.map((row) => (
                    <li key={row.groupCode} className="rounded-lg border border-border/60 p-2">
                      <p className="text-xs font-medium">{row.headerText}</p>
                      {row.equivalents.length === 0 ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Bu grup için henüz eşleştirilmiş besin verisi yok.
                        </p>
                      ) : (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {row.equivalents
                            .map((entry) => entry.portionText ?? entry.gramText)
                            .join(' = ')}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Kapat
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function FoodListPreview({
  days,
  foodMacros,
}: {
  days: DraftDay[]
  foodMacros: Record<string, FoodMacroLookup>
}) {
  return (
    <div className="flex flex-col gap-3">
      {days.map((day) => (
        <div key={day.id} className="flex flex-col gap-2">
          {day.meals.map((meal) => (
            <div key={meal.id} className="rounded-lg border border-border/60 p-2">
              <p className="text-xs font-semibold">{meal.name}</p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {meal.items.map((item) => {
                  const name = item.foodId
                    ? (foodMacros[item.foodId]?.nameTr ?? 'Bilinmeyen besin')
                    : (item.freeText ?? 'Bilinmeyen besin')
                  return (
                    <li key={item.id} className="flex items-center justify-between text-xs">
                      <span className="truncate">{name}</span>
                      <span className="shrink-0 text-muted-foreground">{item.amountGrams} g</span>
                    </li>
                  )
                })}
                {meal.items.length === 0 && (
                  <li className="text-xs text-muted-foreground">Kalem yok.</li>
                )}
              </ul>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function ExchangeListPreview({
  days,
  foodExchangeMap,
}: {
  days: DraftDay[]
  foodExchangeMap: ReturnType<typeof useFoodExchangeMap>
}) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">Değişim listesi</h3>
      {days.map((day) => (
        <div key={day.id} className="flex flex-col gap-2">
          {day.meals.map((meal) => (
            <div key={meal.id} className="rounded-lg border border-border/60 p-2">
              <p className="text-xs font-semibold">{meal.name}</p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {meal.items.map((item) => {
                  const converted = convertItemToExchange(
                    { foodId: item.foodId, amountGrams: item.amountGrams },
                    foodExchangeMap,
                  )
                  return (
                    <li key={item.id} className="flex items-center justify-between text-xs">
                      <span className="truncate">
                        {converted
                          ? `1 ${converted.groupNameTr.toLocaleLowerCase('tr-TR')} değişimi`
                          : (item.freeText ?? 'Bilinmeyen besin')}
                      </span>
                      <Badge variant="outline" className="shrink-0 tabular-nums">
                        {converted ? `${converted.exchangeCount.toFixed(1)}` : `${item.amountGrams} g`}
                      </Badge>
                    </li>
                  )
                })}
                {meal.items.length === 0 && (
                  <li className="text-xs text-muted-foreground">Kalem yok.</li>
                )}
              </ul>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Layers, Loader2, ShieldAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  EXCHANGE_GROUP_CODES,
  compareExchangeUsageToTargets,
  deriveExchangeTargets,
  type ExchangeGroupCode,
} from '@ogun/nutrition-core'
import { computeExchangeUsage, computeUnconvertedItemCount } from '@/lib/plan-exchanges'
import { invokePlanEditorAction } from '@/screens/plan-editor-persistence'
import { EXCHANGE_GROUP_LABELS_TR } from '@/lib/validation/plan-schemas'
import { cn } from '@/lib/utils'
import { usePlanEditorStore, useFoodExchangeMap, type DraftDay } from './plan-editor-store'

interface ExchangeFoodSuggestion {
  foodId: string
  nameTr: string
  gramsPerExchange: number
  isPrimary: boolean
  portionLabel: string | null
  portionGrams: number | null
  allergenConflict: boolean
}

// GitHub issue #28 / Prompt 5.6 — GÖREV 2 + GÖREV 3: "Değişim hedefleri
// paneli... Gram modundaki besin öğesi panelinin YERİNE geçer" — bkz.
// plan-editor.tsx'teki koşullu render (viewMode === 'değişim' ise
// NutrientPanel yerine BU bileşen gösterilir, AYNI sabit sağ panel/mobil alt
// sekme YERİNDE kalır, #25/#26'nın kurduğu dış yapı DEĞİŞMEDİ).
function collectAllItems(days: DraftDay[]): { foodId: string | null; amountGrams: number }[] {
  const items: { foodId: string | null; amountGrams: number }[] = []
  for (const day of days) {
    for (const meal of day.meals) {
      for (const item of meal.items) {
        items.push({ foodId: item.foodId, amountGrams: item.amountGrams })
      }
    }
  }
  return items
}

export function ExchangePanel({
  targetKcal,
  days,
}: {
  targetKcal: number | null
  days: DraftDay[]
}) {
  const foodExchangeMap = useFoodExchangeMap()
  const [expandedGroup, setExpandedGroup] = useState<ExchangeGroupCode | null>(null)

  const allItems = useMemo(() => collectAllItems(days), [days])

  const usage = useMemo(
    () => computeExchangeUsage(allItems, foodExchangeMap),
    [allItems, foodExchangeMap],
  )
  const unconvertedCount = useMemo(
    () => computeUnconvertedItemCount(allItems, foodExchangeMap),
    [allItems, foodExchangeMap],
  )

  const targets = useMemo(
    () => (targetKcal && targetKcal > 0 ? deriveExchangeTargets(targetKcal) : null),
    [targetKcal],
  )
  const comparisons = useMemo(
    () => (targets ? compareExchangeUsageToTargets(targets, usage) : null),
    [targets, usage],
  )

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card/50 p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Layers className="size-4" />
        Değişim hedefleri paneli
      </div>

      {!targets && (
        <p className="text-xs text-muted-foreground">
          Hedefleri görebilmek için önce plan üstünden bir hedef kalori girin — klasik diyabet
          değişim dağılımı tablosu (bkz. nutrition-core/src/exchange-targets.ts) o değere göre
          önerilir.
        </p>
      )}

      {unconvertedCount > 0 && (
        <p className="rounded-lg border border-border/60 bg-background/60 p-2 text-xs text-muted-foreground">
          {unconvertedCount} kalem değişim hesabına dahil edilemedi (serbest metin/tarif kalemi ya
          da besinin bir değişim grubu eşleşmesi yok).
        </p>
      )}

      <ul className="flex flex-col gap-1">
        {EXCHANGE_GROUP_CODES.map((code) => {
          const comparison = comparisons?.find((c) => c.code === code) ?? null
          const usedCount = usage[code] ?? 0
          const isExpanded = expandedGroup === code
          const isOver = comparison !== null && comparison.remaining < 0

          return (
            <li key={code} className="rounded-lg border border-border/60">
              <button
                type="button"
                className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-sm hover:bg-muted/60"
                onClick={() => setExpandedGroup((prev) => (prev === code ? null : code))}
                aria-expanded={isExpanded}
              >
                <span className="min-w-0 flex-1 truncate font-medium">
                  1 {EXCHANGE_GROUP_LABELS_TR[code].toLocaleLowerCase('tr-TR')} değişimi
                </span>
                <span className="w-14 shrink-0 text-right tabular-nums text-muted-foreground">
                  {usedCount.toFixed(1)}
                </span>
                <span className="text-muted-foreground">/</span>
                <span className="w-14 shrink-0 tabular-nums text-muted-foreground">
                  {comparison ? comparison.target.toFixed(1) : '—'}
                </span>
                <Badge
                  variant={isOver ? 'destructive' : 'outline'}
                  className="w-16 shrink-0 justify-center tabular-nums"
                  title="Kalan değişim adedi (negatifse hedef aşıldı)"
                >
                  {comparison ? comparison.remaining.toFixed(1) : '—'}
                </Badge>
                {isExpanded ? (
                  <ChevronUp className="size-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                )}
              </button>
              {isExpanded && <ExchangeFoodSuggestionList groupCode={code} />}
            </li>
          )
        })}
      </ul>
      <p className="text-[0.65rem] text-muted-foreground">
        Hedef / kullanılan / kalan değişim adedi (grup satırına tıklayınca o gruptan uygun
        besinler listelenir).
      </p>
    </div>
  )
}

// GÖREV 3 — "'1 ekmek değişimi' satırına tıklayınca o gruptan uygun
// besinleri listele. Danışanın alerji/intoleransları filtrelensin."
function ExchangeFoodSuggestionList({ groupCode }: { groupCode: ExchangeGroupCode }) {
  const allergies = usePlanEditorStore((s) => s.allergies)
  const intolerances = usePlanEditorStore((s) => s.intolerances)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [suggestions, setSuggestions] = useState<ExchangeFoodSuggestion[]>([])

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    invokePlanEditorAction('listFoodsForExchangeGroupAction', { groupCode, allergies, intolerances })
      .then((result: { success: boolean; data?: ExchangeFoodSuggestion[] }) => {
        if (cancelled) return
        if (!result.success || !result.data) {
          setStatus('error')
          return
        }
        setSuggestions(result.data)
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [groupCode, allergies, intolerances])

  return (
    <div className="border-t border-border/60 px-2.5 py-2">
      {status === 'loading' && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Besinler yükleniyor…
        </div>
      )}
      {status === 'error' && (
        <p className="text-xs text-destructive">Besin önerileri yüklenemedi.</p>
      )}
      {status === 'ready' && suggestions.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Bu grup için henüz eşleştirilmiş besin verisi yok.
        </p>
      )}
      {status === 'ready' && suggestions.length > 0 && (
        <ul className="flex flex-col gap-1">
          {suggestions.map((food) => (
            <li
              key={food.foodId}
              className={cn(
                'flex items-center gap-1.5 text-xs',
                food.allergenConflict && 'text-destructive',
              )}
            >
              {food.allergenConflict && <ShieldAlert className="size-3 shrink-0" />}
              <span className="min-w-0 flex-1 truncate">{food.nameTr}</span>
              <span className="shrink-0 text-muted-foreground">
                {food.gramsPerExchange} g / değişim
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

'use client'

import { useMemo } from 'react'
import { Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { computeMealNutrientTotals, sumMealTotals } from '@/lib/plan-nutrients'
import { usePlanEditorStore, type DraftDay } from './plan-editor-store'

// GitHub issue #25 / Prompt 5.3 — GÖREV 1'in kendi ifadesiyle: "Sağ: sabit
// besin öğesi paneli (Prompt 5.4'te dolduracağız, şimdilik yer tut)".
//
// BİLİNÇLİ KAPSAM SINIRI: mikro besin öğesi listesi (~15 isCore besin),
// TÜBER referans karşılaştırması (renk kodlu %), dairesel enerji ilerleme
// göstergesi, makro dağılım çubuğu ve nutrition-core'un warnings[] kanalının
// (MISSING_NUTRIENT_DATA, IMPUTED_VALUE_HEAVY, UNSAFE_ENERGY_TARGET vb.)
// gösterimi — HEPSİ GitHub issue #26 / Prompt 5.4'ün kapsamı. Bu bileşen
// SADECE o panelin YER TUTUCUSU + bugün zaten elimizde olan basit bir plan
// toplamı (kcal/hedef) — #26 bu dosyanın İÇİNİ dolduracak, DIŞ yapıyı
// (sticky sağ panel / mobil alt sekme, bkz. plan-editor.tsx) YENİDEN
// KURMAYACAK.
export function NutrientPanel({
  targetKcal,
  days,
}: {
  targetKcal: number | null
  days: DraftDay[]
}) {
  const foodMacros = usePlanEditorStore((s) => s.foodMacros)

  const planTotalKcal = useMemo(() => {
    const lookup = new Map(Object.entries(foodMacros))
    const mealTotals = days.flatMap((day) =>
      day.meals.map((meal) =>
        computeMealNutrientTotals(
          meal.items.map((item) => ({ foodId: item.foodId, amountGrams: item.amountGrams })),
          lookup,
        ),
      ),
    )
    return sumMealTotals(mealTotals).kcalTotal
  }, [days, foodMacros])

  const pct = targetKcal && targetKcal > 0 ? Math.round((planTotalKcal / targetKcal) * 100) : null

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-dashed border-border bg-card/50 p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Sparkles className="size-4" />
        Besin öğesi paneli
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold">{planTotalKcal.toFixed(0)}</span>
        <span className="text-sm text-muted-foreground">
          kcal {targetKcal !== null ? `/ ${targetKcal} kcal hedef` : ''}
        </span>
        {pct !== null && (
          <Badge variant={pct < 90 || pct > 110 ? 'destructive' : 'outline'} className="ml-auto">
            %{pct}
          </Badge>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Mikro besin öğesi listesi, TÜBER referans karşılaştırması ve uyarılar (eksik veri, tahmini
        değer oranı, güvenli olmayan enerji hedefi vb.) burada — Prompt 5.4&apos;te (GitHub issue
        #26) dolacak.
      </p>
    </div>
  )
}

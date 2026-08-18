'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, Info, ShieldAlert, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  MACRO_DISTRIBUTION_TARGET_RANGES,
  NUTRIENT,
  selectAgeGroupReference,
  TUBER_2022_PLACEHOLDER,
  type NutrientLevelBand,
  type NutritionWarning,
} from '@ogun/nutrition-core'
import {
  getFoodIndexEntriesByIds,
  getNutrientDefinitions,
  type NutrientDefRow,
} from '@/lib/food-index'
import { buildLivePanelData, type FoodNutrientLookup } from '@/lib/plan-live-panel'
import { cn } from '@/lib/utils'
import { usePlanEditorStore, useAllergenConflictMap, type DraftDay } from './plan-editor-store'

// GitHub issue #26 / Prompt 5.4 — GÖREV 1-4'ün TAMAMI: enerji/hedef +
// dairesel ilerleme, makro dağılım çubuğu (hedef aralığı gölgeli), öğün
// dağılımı, isCore mikro besin öğesi listesi (+ "Tümünü göster"),
// nutrition-core'un warnings[] kanalı ve alerji/intolerans çakışması.
// #25'in bıraktığı YER TUTUCUYU dolduruyor — DIŞ yapı (sticky sağ panel /
// mobil alt sekme) plan-editor.tsx'te AYNEN kalıyor, burada SADECE bu
// bileşenin İÇİ değişti.
//
// GÖREV 4: "Hesap İSTEMCİDE yapılsın... Besin verisi Dexie'den okunsun...
// 150ms debounce ile yeniden hesapla." — bu bileşen `days` değiştiğinde
// HEMEN Dexie'ye gitmez, 150ms bekler (aşağıdaki useEffect), Dexie okuması
// bitince nutrition-core'un SAF calculateLivePlanNutrients'ı (bkz.
// lib/plan-live-panel.ts) senkron ve hızlı çalışır — ölçülen gerçek
// gecikmeler için bkz. PR açıklaması / plan-live-panel.test.ts'teki
// benchmark testi.
const DEBOUNCE_MS = 150
const LIVE_PANEL_TARGET_MS = 50

function collectFoodIds(days: DraftDay[]): string[] {
  const ids = new Set<string>()
  for (const day of days) {
    for (const meal of day.meals) {
      for (const item of meal.items) {
        if (item.foodId) ids.add(item.foodId)
        for (const alt of item.alternatives) {
          if (alt.foodId) ids.add(alt.foodId)
        }
      }
    }
  }
  return [...ids]
}

export function NutrientPanel({
  targetKcal,
  days,
}: {
  targetKcal: number | null
  days: DraftDay[]
}) {
  const clientSex = usePlanEditorStore((s) => s.clientSex)
  const clientAge = usePlanEditorStore((s) => s.clientAge)
  const allergenConflicts = useAllergenConflictMap()

  const [nutrientDefs, setNutrientDefs] = useState<NutrientDefRow[]>([])
  const [foodLookup, setFoodLookup] = useState<Map<string, FoodNutrientLookup>>(new Map())
  const [showAllNutrients, setShowAllNutrients] = useState(false)
  const lastMeasuredMsRef = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false
    getNutrientDefinitions()
      .then((defs) => {
        if (!cancelled) setNutrientDefs(defs)
      })
      .catch((error: unknown) => console.error('[NutrientPanel] besin öğesi kataloğu yüklenemedi:', error))
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const foodIds = collectFoodIds(days)
    const timer = setTimeout(() => {
      const start = performance.now()
      getFoodIndexEntriesByIds(foodIds)
        .then((rows) => {
          setFoodLookup(rows)
          const elapsedMs = performance.now() - start
          lastMeasuredMsRef.current = elapsedMs
          if (elapsedMs > LIVE_PANEL_TARGET_MS) {
            console.warn(
              `NutrientPanel güncellemesi yavaş: ${elapsedMs.toFixed(1)}ms (hedef < ${LIVE_PANEL_TARGET_MS}ms)`,
            )
          }
        })
        .catch((error: unknown) => console.error('[NutrientPanel] besin verisi okunamadı:', error))
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [days])

  const coreNutrientCodes = useMemo(
    () => nutrientDefs.filter((d) => d.isCore).map((d) => d.code),
    [nutrientDefs],
  )

  const reference = useMemo(() => {
    if (clientSex === null || clientAge === null) return null
    return selectAgeGroupReference(TUBER_2022_PLACEHOLDER, clientAge, clientSex)
  }, [clientSex, clientAge])

  const panelData = useMemo(
    () => buildLivePanelData({ days, foodLookup, targetKcal, reference, coreNutrientCodes }),
    [days, foodLookup, targetKcal, reference, coreNutrientCodes],
  )

  const allergyConflictCount = useMemo(() => {
    let count = 0
    for (const day of days) {
      for (const meal of day.meals) {
        for (const item of meal.items) {
          if (item.foodId && allergenConflicts.has(item.foodId)) count += 1
        }
      }
    }
    return count
  }, [days, allergenConflicts])

  const totalKcal = panelData.totalNutrients[NUTRIENT.ENERGY_KCAL] ?? 0
  const kcalPercent = targetKcal && targetKcal > 0 ? (totalKcal / targetKcal) * 100 : null

  const nutrientDefByCode = useMemo(() => new Map(nutrientDefs.map((d) => [d.code, d])), [nutrientDefs])
  const visibleNutrients = showAllNutrients
    ? panelData.nutrientLevels
    : panelData.nutrientLevels.filter((n) => nutrientDefByCode.get(n.nutrientCode)?.isCore)

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card/50 p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Sparkles className="size-4" />
        Besin öğesi paneli
        {panelData.dayCount > 1 && (
          <Badge variant="outline" className="ml-auto text-[0.65rem]">
            {panelData.dayCount} günlük ortalama
          </Badge>
        )}
      </div>

      <EnergySummary totalKcal={totalKcal} targetKcal={targetKcal} kcalPercent={kcalPercent} />

      <MacroDistributionBar
        proteinPercent={panelData.macroDistribution.proteinPercent}
        carbPercent={panelData.macroDistribution.carbPercent}
        fatPercent={panelData.macroDistribution.fatPercent}
      />

      {panelData.mealEnergyShares.length > 0 && (
        <MealDistributionList shares={panelData.mealEnergyShares} />
      )}

      <WarningsList
        warnings={panelData.warnings}
        allergyConflictCount={allergyConflictCount}
      />

      <NutrientLevelList
        levels={visibleNutrients}
        nutrientDefByCode={nutrientDefByCode}
        hasReference={reference !== null}
        showAll={showAllNutrients}
        onToggleShowAll={() => setShowAllNutrients((v) => !v)}
        totalNutrientCount={panelData.nutrientLevels.length}
      />
    </div>
  )
}

function EnergySummary({
  totalKcal,
  targetKcal,
  kcalPercent,
}: {
  totalKcal: number
  targetKcal: number | null
  kcalPercent: number | null
}) {
  // Dairesel ilerleme: 0-150% aralığını gösterir (150%+ tamamen dolu halka).
  const clampedPercent = kcalPercent === null ? 0 : Math.min(Math.max(kcalPercent, 0), 150)
  const ringFraction = clampedPercent / 150
  const radius = 26
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - ringFraction)
  const ringColor =
    kcalPercent === null
      ? 'stroke-muted-foreground/30'
      : kcalPercent < 90 || kcalPercent > 110
        ? 'stroke-orange-500'
        : 'stroke-green-500'

  return (
    <div className="flex items-center gap-3">
      <svg width={64} height={64} viewBox="0 0 64 64" className="shrink-0 -rotate-90">
        <circle cx={32} cy={32} r={radius} className="fill-none stroke-muted" strokeWidth={6} />
        <circle
          cx={32}
          cy={32}
          r={radius}
          className={cn('fill-none transition-[stroke-dashoffset]', ringColor)}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <div className="flex flex-col">
        <div className="flex items-baseline gap-1">
          {/* GitHub issue #59 / Faz 10, GÖREV 3 — toplam kcal her düzenlemede
              canlı güncelleniyor; orantılı rakamlarda sayının genişliği
              değiştikçe yanındaki "kcal" etiketi zıplıyordu. */}
          <span className="text-2xl font-semibold tabular-nums">{totalKcal.toFixed(0)}</span>
          <span className="text-sm text-muted-foreground">kcal</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {targetKcal !== null ? `${targetKcal} kcal hedef` : 'Hedef kalori girilmedi'}
        </span>
        {kcalPercent !== null && (
          <Badge
            variant={kcalPercent < 90 || kcalPercent > 110 ? 'destructive' : 'outline'}
            className="mt-1 w-fit"
          >
            %{kcalPercent.toFixed(0)}
          </Badge>
        )}
      </div>
    </div>
  )
}

const MACRO_COLORS: Record<'protein' | 'carb' | 'fat', string> = {
  protein: 'bg-blue-500',
  carb: 'bg-amber-500',
  fat: 'bg-rose-500',
}

// GÖREV 1: "Makro dağılımı: protein/karbonhidrat/yağ yüzdesi, yatay yığın
// çubuk, hedef aralığı gölgeli gösterilsin."
function MacroDistributionBar({
  proteinPercent,
  carbPercent,
  fatPercent,
}: {
  proteinPercent: number
  carbPercent: number
  fatPercent: number
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
        <span>Makro dağılımı</span>
      </div>
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
        {/* Hedef aralığı gölgeli gösterim — her makronun kendi AMDR aralığı,
            çubuğun ÜSTÜNE değil ALTINA (arka planda) çizilir, üstteki gerçek
            değer çubuğuyla karışmasın diye farklı bir katman (opacity). */}
        <div className="absolute inset-0 flex">
          {(['protein', 'carb', 'fat'] as const).map((key) => {
            const range = MACRO_DISTRIBUTION_TARGET_RANGES[key]
            return (
              <div key={key} className="relative flex-1 border-r border-background/40 last:border-r-0">
                <div
                  className="absolute inset-y-0 bg-foreground/10"
                  style={{ left: `${range.min}%`, right: `${100 - range.max}%` }}
                  title={`Önerilen aralık: %${range.min}-${range.max}`}
                />
              </div>
            )
          })}
        </div>
        <div className="absolute inset-0 flex">
          <div className={cn(MACRO_COLORS.protein)} style={{ width: `${proteinPercent}%` }} />
          <div className={cn(MACRO_COLORS.carb)} style={{ width: `${carbPercent}%` }} />
          <div className={cn(MACRO_COLORS.fat)} style={{ width: `${fatPercent}%` }} />
        </div>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        <MacroLegendItem color={MACRO_COLORS.protein} label="Protein" percent={proteinPercent} />
        <MacroLegendItem color={MACRO_COLORS.carb} label="Karbonhidrat" percent={carbPercent} />
        <MacroLegendItem color={MACRO_COLORS.fat} label="Yağ" percent={fatPercent} />
      </div>
    </div>
  )
}

function MacroLegendItem({ color, label, percent }: { color: string; label: string; percent: number }) {
  return (
    <span className="flex items-center gap-1 text-muted-foreground">
      <span className={cn('size-2 rounded-full', color)} />
      {label} %{percent.toFixed(0)}
    </span>
  )
}

// GÖREV 1: "Öğün dağılımı: her öğünün günlük enerjiye oranı."
function MealDistributionList({
  shares,
}: {
  shares: { mealName: string; kcal: number; percentOfDailyTotal: number }[]
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">Öğün dağılımı</span>
      <div className="flex flex-col gap-1">
        {shares.map((share) => (
          <div key={share.mealName} className="flex items-center gap-2 text-xs">
            <span className="w-24 shrink-0 truncate text-muted-foreground">{share.mealName}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.min(share.percentOfDailyTotal, 100)}%` }}
              />
            </div>
            <span className="w-10 shrink-0 text-right tabular-nums text-muted-foreground">
              %{share.percentOfDailyTotal.toFixed(0)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

const WARNING_SEVERITY_ICON: Record<NutritionWarning['severity'], typeof Info> = {
  info: Info,
  warning: AlertTriangle,
  danger: AlertTriangle,
}

const WARNING_SEVERITY_CLASS: Record<NutritionWarning['severity'], string> = {
  info: 'text-muted-foreground',
  warning: 'text-amber-600 dark:text-amber-400',
  danger: 'text-destructive',
}

// GÖREV 3: nutrition-core'un warnings[] kanalı + alerji/intolerans çakışması.
function WarningsList({
  warnings,
  allergyConflictCount,
}: {
  warnings: NutritionWarning[]
  allergyConflictCount: number
}) {
  if (warnings.length === 0 && allergyConflictCount === 0) return null

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border/60 bg-background/60 p-2">
      {allergyConflictCount > 0 && (
        <div className="flex items-start gap-1.5 text-xs text-destructive">
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {allergyConflictCount} kalem danışanın alerji/intolerans listesiyle çakışıyor —
            satırlarda kırmızı ikonla işaretlendi.
          </span>
        </div>
      )}
      {warnings.map((warning, index) => {
        const Icon = WARNING_SEVERITY_ICON[warning.severity]
        return (
          <div
            key={`${warning.code}-${index}`}
            className={cn('flex items-start gap-1.5 text-xs', WARNING_SEVERITY_CLASS[warning.severity])}
          >
            <Icon className="mt-0.5 size-3.5 shrink-0" />
            <span>{warning.message}</span>
          </div>
        )
      })}
    </div>
  )
}

const BAND_CLASS: Record<NutrientLevelBand, string> = {
  low: 'bg-red-500/10 text-red-700 dark:text-red-400',
  adequate: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
  optimal: 'bg-green-500/10 text-green-700 dark:text-green-400',
  excessive: 'bg-orange-500/10 text-orange-700 dark:text-orange-400',
  no_reference: 'bg-muted text-muted-foreground',
}

const BAND_LABEL: Record<NutrientLevelBand, string> = {
  low: 'Düşük',
  adequate: 'Yeterliye yakın',
  optimal: 'Yeterli',
  excessive: 'Üst sınırın üstünde',
  no_reference: 'Referans yok',
}

// GÖREV 2: mikro besin öğesi listesi — isCore=true olan ~15, "Tümünü göster"
// ile ~60'ın tamamı. Her satır: ad, değer, referansın yüzdesi, renk kodu.
function NutrientLevelList({
  levels,
  nutrientDefByCode,
  hasReference,
  showAll,
  onToggleShowAll,
  totalNutrientCount,
}: {
  levels: { nutrientCode: string; actualValue: number; percentOfReference: number | null; band: NutrientLevelBand }[]
  nutrientDefByCode: Map<string, NutrientDefRow>
  hasReference: boolean
  showAll: boolean
  onToggleShowAll: () => void
  totalNutrientCount: number
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Mikro besin öğeleri</span>
        {totalNutrientCount > levels.length || showAll ? (
          <Button variant="ghost" size="sm" className="h-6 gap-1 px-1.5 text-xs" onClick={onToggleShowAll}>
            {showAll ? (
              <>
                Sadece temel <ChevronUp className="size-3" />
              </>
            ) : (
              <>
                Tümünü göster <ChevronDown className="size-3" />
              </>
            )}
          </Button>
        ) : null}
      </div>

      {!hasReference && (
        <p className="text-xs text-muted-foreground">
          Danışanın yaş/cinsiyet bilgisi eksik olduğu için referans karşılaştırması gösterilemiyor —
          değerler yine de listelendi.
        </p>
      )}

      <ul className="flex flex-col gap-0.5">
        {levels.map((level) => {
          const def = nutrientDefByCode.get(level.nutrientCode)
          return (
            <li key={level.nutrientCode} className="flex items-center gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate">{def?.nameTr ?? level.nutrientCode}</span>
              <span className="w-16 shrink-0 text-right tabular-nums text-muted-foreground">
                {level.actualValue.toFixed(1)} {def?.unit ?? ''}
              </span>
              <Badge className={cn('w-24 shrink-0 justify-center', BAND_CLASS[level.band])} variant="outline">
                {level.percentOfReference !== null
                  ? `%${level.percentOfReference.toFixed(0)}`
                  : BAND_LABEL[level.band]}
              </Badge>
            </li>
          )
        })}
        {levels.length === 0 && (
          <li className="text-xs text-muted-foreground">Henüz kalem eklenmedi.</li>
        )}
      </ul>
    </div>
  )
}

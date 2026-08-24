'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronsDown,
  ChevronsUp,
  ChevronUp,
  Info,
  Minus,
  ShieldAlert,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
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
  whenFoodIndexReady,
  type NutrientDefRow,
} from '@/lib/food-index'
import { buildLivePanelData, type FoodNutrientLookup } from '@/lib/plan-live-panel'
import { cn } from '@/lib/utils'
import { usePlanEditorStore, useAllergenConflictMap, type DraftDay } from './plan-editor-store'

// GitHub issue #26 / Prompt 5.4 — GÖREV 1-4'ün TAMAMI: enerji/hedef +
// dairesel ilerleme, makro dağılım çubuğu (hedef aralığı gölgeli), öğün
// dağılımı, isCore mikro besin öğesi listesi (+ "Tümünü göster"),
// nutrition-core'un warnings[] kanalı ve alerji/intolerans çakışması.
//
// GitHub issue #61 / Faz 10, Prompt 10.3, GÖREV 3 — BÖLÜMLENDİRME.
// Panel düz bir listeydi: enerji, makro, öğün dağılımı, uyarılar ve ~15-60
// mikro besin öğesi ARDIŞIK olarak akıyor, panel ekrandan taşıyor ve
// diyetisyen en çok baktığı iki sayıya (enerji + makro) ulaşmak için bile
// kaydırıyordu. Üç bölüm:
// Özet, mikro besinler ve uyarılar tek bir kaydırma yüzeyinde, birbirinden
// kenarlık ve yüzey rengiyle ayrılmış normal akış bölümleridir. İç içe
// ScrollArea kullanmak dar pencerelerde mikro besinleri uyarıların üstüne
// taşıdığı için kaldırılmıştır.
//
// GÖREV 3 (erişilebilirlik): "Durum renklerini yalnızca renkle taşıma".
// Her durum bandının AYRI BİR İKONU var (bkz. BAND_ICON) — renk körü bir
// kullanıcı için ayırt edici bilgi ikonun ŞEKLİNDE; renk yalnızca pekiştirme.
// Ayrıca her satır `title`/`aria-label` ile bandın Türkçe adını taşır ve
// listenin başında bir ikon ANAHTARI (legend) var.
//
// GÖREV 4 (#26): "Hesap İSTEMCİDE yapılsın... Besin verisi Dexie'den
// okunsun... 150ms debounce ile yeniden hesapla." — bu bileşen `days`
// değiştiğinde HEMEN Dexie'ye gitmez, 150ms bekler (aşağıdaki useEffect),
// Dexie okuması bitince nutrition-core'un SAF calculateLivePlanNutrients'ı
// (bkz. lib/plan-live-panel.ts) senkron ve hızlı çalışır — ölçülen gerçek
// gecikmeler için bkz. PR açıklaması / plan-live-panel-benchmark.ts.
const DEBOUNCE_MS = 150
const LIVE_PANEL_TARGET_MS = 50
const QUICK_MICRONUTRIENT_CODES = ['CA', 'FE', 'VITB12', 'VITD'] as const

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
  const foodMacros = usePlanEditorStore((s) => s.foodMacros)

  const [nutrientDefs, setNutrientDefs] = useState<NutrientDefRow[]>([])
  const [foodLookup, setFoodLookup] = useState<Map<string, FoodNutrientLookup>>(new Map())
  const [showAllNutrients, setShowAllNutrients] = useState(false)
  const lastMeasuredMsRef = useRef<number | null>(null)

  // GitHub issue #61 — besin öğesi KATALOĞU da (nutrientDefs) indeksle AYNI
  // Dexie yüklemesinden gelir; indeks inmeden okunursa liste kalıcı olarak boş
  // kalıyordu (kalemlerin "Bilinmeyen besin" kalmasının panel tarafındaki
  // eşleniği — bkz. plan-editor-store.ts resolveFoodMacros notu).
  useEffect(() => {
    let cancelled = false
    whenFoodIndexReady()
      .then(() => getNutrientDefinitions())
      .then((defs) => {
        if (!cancelled) setNutrientDefs(defs)
      })
      .catch((error: unknown) =>
        console.error('[NutrientPanel] besin öğesi kataloğu yüklenemedi:', error),
      )
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const foodIds = collectFoodIds(days)
    const timer = setTimeout(() => {
      // İndeksin hazır olmasını BEKLEMEK ölçümün DIŞINDA tutuluyor: burada
      // ölçülmek istenen şey Dexie okuması + saf hesap (LIVE_PANEL_TARGET_MS),
      // ilk açılıştaki ~20-30 sn'lik katalog indirmesi değil.
      void whenFoodIndexReady().then(() => {
        const start = performance.now()
        return getFoodIndexEntriesByIds(foodIds)
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
          .catch((error: unknown) =>
            console.error('[NutrientPanel] besin verisi okunamadı:', error),
          )
      })
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

  const allergenWarnings = useMemo(() => {
    const messages = new Set<string>()
    for (const day of days) {
      for (const meal of day.meals) {
        for (const item of meal.items) {
          if (!item.foodId) continue
          const conflicts = allergenConflicts.get(item.foodId) ?? []
          const foodName = foodMacros[item.foodId]?.nameTr ?? 'Besin'
          for (const conflict of conflicts) {
            const source =
              conflict.matchedOn === 'ingredient' ? `; içerik: ${conflict.matchedText}` : ''
            messages.add(`${foodName}: ${conflict.entry.label}${source}`)
          }
        }
      }
    }
    return [...messages]
  }, [days, allergenConflicts, foodMacros])

  const totalKcal = panelData.totalNutrients[NUTRIENT.ENERGY_KCAL] ?? 0
  const kcalPercent = targetKcal && targetKcal > 0 ? (totalKcal / targetKcal) * 100 : null

  const nutrientDefByCode = useMemo(
    () => new Map(nutrientDefs.map((d) => [d.code, d])),
    [nutrientDefs],
  )
  const micronutrientLevels = useMemo(() => {
    const levelByCode = new Map(
      panelData.nutrientLevels.map((level) => [level.nutrientCode, level]),
    )
    return nutrientDefs
      .filter((def) => def.category === 'vitamin' || def.category === 'mineral')
      .flatMap((def) => {
        const level = levelByCode.get(def.code)
        return level ? [level] : []
      })
  }, [nutrientDefs, panelData.nutrientLevels])
  const visibleNutrients = showAllNutrients
    ? micronutrientLevels
    : micronutrientLevels.filter((n) => nutrientDefByCode.get(n.nutrientCode)?.isCore)
  const quickMicronutrients = QUICK_MICRONUTRIENT_CODES.flatMap((code) => {
    const def = nutrientDefByCode.get(code)
    if (!def) return []
    return [
      { code, name: def.nameTr, unit: def.unit, value: panelData.totalNutrients[code] ?? null },
    ]
  })

  return (
    // Masaüstünde panel görünen alanı doldurur; dar penceredeki Sheet içinde
    // ise kendi tek kaydırma yüzeyine sınır koyar.
    // Yükseklik hesabı: 100svh − (üst bar 3.5rem + sticky boşluğu 1rem + alt
    // nefes payı 1rem) = 100svh − 5.5rem. Kabuğun üst barı (bkz. (app)/
    // layout.tsx TopBar, h-14) kaydırma kabının DIŞINDA olduğu için düşülmesi
    // gerekiyor; düşülmezse panelin alt kenarı (uyarılar bölümü) ekranın
    // altında kalıyor.
    // `overflow-hidden` yalnız ScrollArea viewport'unu yuvarlak panel sınırında
    // tutar; içerik kırpılmak yerine bu tek viewport içinde kaydırılır.
    <div className="flex h-full max-h-[calc(80svh-5rem)] flex-col overflow-hidden rounded-xl border border-border bg-card/50 lg:h-[calc(100svh-5.5rem)] lg:max-h-none">
      <div className="flex items-center gap-2 px-4 pt-4 pb-3 text-body font-medium text-muted-foreground">
        <Sparkles className="size-4" />
        Besin öğesi paneli
        {panelData.dayCount > 1 && (
          <Badge variant="outline" className="ml-auto text-helper">
            {panelData.dayCount} günlük ortalama
          </Badge>
        )}
      </div>

      {/* Tek bir kaydırma yüzeyi kullanılır. Mikro besin ve uyarı bölümlerinin
          ayrı viewport'ları dar yükseklikte birbirinin üstüne taşabiliyordu. */}
      <ScrollArea className="min-h-0 flex-1">
        {/* --- 1. BÖLÜM: ÖZET (enerji + makro + öğün dağılımı) ---------------- */}
        <div className="flex flex-col gap-3 px-4 pb-3">
          <EnergySummary
            totalKcal={totalKcal}
            targetKcal={targetKcal}
            kcalPercent={kcalPercent}
            quickMicronutrients={quickMicronutrients}
          />

          <MacroDistributionBar
            proteinPercent={panelData.macroDistribution.proteinPercent}
            carbPercent={panelData.macroDistribution.carbPercent}
            fatPercent={panelData.macroDistribution.fatPercent}
          />

          {panelData.mealEnergyShares.length > 0 && (
            <MealDistributionList shares={panelData.mealEnergyShares} />
          )}
        </div>

        {/* --- 2. BÖLÜM: MİKRO BESİN ÖĞELERİ --------------------------------- */}
        <NutrientLevelSection
          levels={visibleNutrients}
          nutrientDefByCode={nutrientDefByCode}
          hasReference={reference !== null}
          showAll={showAllNutrients}
          onToggleShowAll={() => setShowAllNutrients((v) => !v)}
          totalNutrientCount={micronutrientLevels.length}
        />

        {/* --- 3. BÖLÜM: UYARILAR (altta, ayrık) ----------------------------- */}
        <WarningsSection warnings={panelData.warnings} allergenWarnings={allergenWarnings} />
      </ScrollArea>
    </div>
  )
}

function EnergySummary({
  totalKcal,
  targetKcal,
  kcalPercent,
  quickMicronutrients,
}: {
  totalKcal: number
  targetKcal: number | null
  kcalPercent: number | null
  quickMicronutrients: { code: string; name: string; unit: string; value: number | null }[]
}) {
  // Dairesel ilerleme: 0-150% aralığını gösterir (150%+ tamamen dolu halka).
  const clampedPercent = kcalPercent === null ? 0 : Math.min(Math.max(kcalPercent, 0), 150)
  const ringFraction = clampedPercent / 150
  const radius = 26
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - ringFraction)
  const offTarget = kcalPercent !== null && (kcalPercent < 90 || kcalPercent > 110)
  const ringColor =
    kcalPercent === null
      ? 'stroke-muted-foreground/30'
      : offTarget
        ? 'stroke-orange-500'
        : 'stroke-green-600'

  return (
    <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] items-center gap-3 rounded-lg border border-border/70 bg-background/55 p-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <svg width={58} height={58} viewBox="0 0 64 64" className="shrink-0 -rotate-90">
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
        <div className="flex min-w-0 flex-col">
          <div className="flex flex-wrap items-baseline gap-1">
            <span className="text-data-lg">{totalKcal.toFixed(0)}</span>
            <span className="text-body text-muted-foreground">kcal</span>
            {kcalPercent !== null && (
              <Badge
                variant={offTarget ? 'destructive' : 'outline'}
                className="gap-1 text-data"
                title={offTarget ? 'Hedefin %90-110 aralığının dışında' : 'Hedef aralığında'}
              >
                {offTarget ? (
                  <AlertTriangle className="size-3" aria-hidden />
                ) : (
                  <Check className="size-3" aria-hidden />
                )}
                %{kcalPercent.toFixed(0)}
              </Badge>
            )}
          </div>
          <span className="text-helper text-muted-foreground">
            {targetKcal !== null ? `${targetKcal} kcal hedef` : 'Hedef kalori girilmedi'}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 border-l border-border pl-3">
        {quickMicronutrients.map((nutrient) => (
          <div key={nutrient.code} className="min-w-0" title={nutrient.name}>
            <div className="truncate text-helper text-muted-foreground">{nutrient.name}</div>
            <div className="truncate text-data tabular-nums">
              {nutrient.value === null ? '—' : formatCompactNutrient(nutrient.value)}{' '}
              <span className="font-normal text-muted-foreground">{nutrient.unit}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function formatCompactNutrient(value: number): string {
  if (Math.abs(value) >= 100) return value.toFixed(0)
  if (Math.abs(value) >= 10) return value.toFixed(1)
  return value.toFixed(2)
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
      <span className="text-helper font-medium text-muted-foreground">Makro dağılımı</span>
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
        {/* Hedef aralığı gölgeli gösterim — her makronun kendi AMDR aralığı,
            çubuğun ÜSTÜNE değil ALTINA (arka planda) çizilir, üstteki gerçek
            değer çubuğuyla karışmasın diye farklı bir katman (opacity). */}
        <div className="absolute inset-0 flex">
          {(['protein', 'carb', 'fat'] as const).map((key) => {
            const range = MACRO_DISTRIBUTION_TARGET_RANGES[key]
            return (
              <div
                key={key}
                className="relative flex-1 border-r border-background/40 last:border-r-0"
              >
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
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        <MacroLegendItem color={MACRO_COLORS.protein} label="Protein" percent={proteinPercent} />
        <MacroLegendItem color={MACRO_COLORS.carb} label="Karbonhidrat" percent={carbPercent} />
        <MacroLegendItem color={MACRO_COLORS.fat} label="Yağ" percent={fatPercent} />
      </div>
    </div>
  )
}

function MacroLegendItem({
  color,
  label,
  percent,
}: {
  color: string
  label: string
  percent: number
}) {
  return (
    <span className="flex items-center gap-1 text-helper text-muted-foreground">
      <span className={cn('size-2 rounded-full', color)} />
      {label} <span className="text-helper tabular-nums">%{percent.toFixed(0)}</span>
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
      <span className="text-helper font-medium text-muted-foreground">Öğün dağılımı</span>
      <div className="flex flex-col gap-1">
        {shares.map((share) => (
          <div key={share.mealName} className="flex items-center gap-2">
            <span className="w-24 shrink-0 truncate text-helper text-muted-foreground">
              {share.mealName}
            </span>
            <Progress
              value={Math.min(share.percentOfDailyTotal, 100)}
              className="h-1.5 flex-1"
              aria-label={`${share.mealName} günlük enerjinin yüzde ${share.percentOfDailyTotal.toFixed(0)}'i`}
            />
            <span className="w-10 shrink-0 text-right text-helper tabular-nums text-muted-foreground">
              %{share.percentOfDailyTotal.toFixed(0)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

const WARNING_SEVERITY_ICON: Record<NutritionWarning['severity'], LucideIcon> = {
  info: Info,
  warning: AlertTriangle,
  danger: AlertTriangle,
}

const WARNING_SEVERITY_CLASS: Record<NutritionWarning['severity'], string> = {
  info: 'text-muted-foreground',
  warning: 'text-amber-600 dark:text-amber-400',
  danger: 'text-destructive',
}

// GÖREV 3 (#26): nutrition-core'un warnings[] kanalı + alerji/intolerans
// çakışması. #61: panelin EN ALTINDA, üstündeki bölümden kenarlıkla AYRIK.
function WarningsSection({
  warnings,
  allergenWarnings,
}: {
  warnings: NutritionWarning[]
  allergenWarnings: string[]
}) {
  if (warnings.length === 0 && allergenWarnings.length === 0) return null

  return (
    <div className="border-t border-border bg-muted/20 px-4 py-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-helper font-medium text-muted-foreground">
        <AlertTriangle className="size-3.5" aria-hidden />
        Uyarılar
        <Badge variant="outline" className="ml-auto text-helper tabular-nums">
          {warnings.length + allergenWarnings.length}
        </Badge>
      </div>
      <div className="flex flex-col gap-1.5">
        {allergenWarnings.map((message) => (
          <div key={message} className="flex items-start gap-1.5 text-helper text-destructive">
            <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>{message}</span>
          </div>
        ))}
        {warnings.map((warning, index) => {
          const Icon = WARNING_SEVERITY_ICON[warning.severity]
          return (
            <div
              key={`${warning.code}-${index}`}
              className={cn(
                'flex items-start gap-1.5 text-helper',
                WARNING_SEVERITY_CLASS[warning.severity],
              )}
            >
              <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>{warning.message}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// GitHub issue #61 / GÖREV 3 — "Durum renklerini yalnızca renkle taşıma —
// ikon veya desen ekle (renk körlüğü)". Beş bandın her biri AYRI BİR ŞEKİL:
//
//   düşük            ChevronsDown  (çift aşağı) — belirgin biçimde eksik
//   yeterliye yakın  ChevronDown   (tek aşağı)  — sınırın hemen altında
//   yeterli          Check         (onay)       — hedef aralığında
//   üst sınır üstü   ChevronsUp    (çift yukarı)— üst sınırın üstünde
//   referans yok     Minus         (nötr çizgi) — karşılaştırılamıyor
//
// Şekiller tek başına ("çift aşağı" ↔ "tek aşağı" ↔ "onay" ↔ "çift yukarı")
// ayırt edici; renk yalnızca pekiştirme katmanı. Ölçüt #59'un
// scripts/validate_palette.js titizliğiyle aynı: bilgi HİÇBİR ZAMAN tek bir
// duyusal kanalda taşınmaz.
const BAND_ICON: Record<NutrientLevelBand, LucideIcon> = {
  low: ChevronsDown,
  adequate: ChevronDown,
  optimal: Check,
  excessive: ChevronsUp,
  no_reference: Minus,
}

// Metin/ikon rengi. NOT (#59 GÖREV 1 kuralı): burada MARKA yeşili (--primary)
// KULLANILMAZ — bu veri gösterimi, eylem değil; kırmızı/sarı/yeşil/turuncu
// klinik semantiği korunuyor.
const BAND_TEXT_CLASS: Record<NutrientLevelBand, string> = {
  low: 'text-red-700 dark:text-red-400',
  adequate: 'text-yellow-700 dark:text-yellow-400',
  optimal: 'text-green-700 dark:text-green-400',
  excessive: 'text-orange-700 dark:text-orange-400',
  no_reference: 'text-muted-foreground',
}

// Çubuğun dolgu rengi (bkz. components/ui/progress.tsx indicatorClassName).
const BAND_BAR_CLASS: Record<NutrientLevelBand, string> = {
  low: 'bg-red-500',
  adequate: 'bg-yellow-500',
  optimal: 'bg-green-600',
  excessive: 'bg-orange-500',
  no_reference: 'bg-muted-foreground/40',
}

const BAND_LABEL: Record<NutrientLevelBand, string> = {
  low: 'Düşük',
  adequate: 'Yeterliye yakın',
  optimal: 'Yeterli',
  excessive: 'Üst sınırın üstünde',
  no_reference: 'Referans yok',
}

const BAND_ORDER: NutrientLevelBand[] = ['low', 'adequate', 'optimal', 'excessive', 'no_reference']

// GÖREV 2 (#26): mikro besin öğesi listesi — isCore=true olan ~15, "Tümünü
// göster" ile ~60'ın tamamı. Her satır: ad, değer, referansın yüzdesi, durum.
// #61: satır iki satıra açıldı (ad + değer / çubuk + yüzde), liste kendi
// içinde kaydırılıyor ve durum artık ikon + renk + metin ile taşınıyor.
function NutrientLevelSection({
  levels,
  nutrientDefByCode,
  hasReference,
  showAll,
  onToggleShowAll,
  totalNutrientCount,
}: {
  levels: {
    nutrientCode: string
    actualValue: number
    percentOfReference: number | null
    band: NutrientLevelBand
  }[]
  nutrientDefByCode: Map<string, NutrientDefRow>
  hasReference: boolean
  showAll: boolean
  onToggleShowAll: () => void
  totalNutrientCount: number
}) {
  return (
    <div className="flex flex-col border-t border-border">
      <div className="flex shrink-0 items-center justify-between gap-2 px-4 pt-3">
        <span className="text-helper font-medium text-muted-foreground">Mikro besin öğeleri</span>
        {totalNutrientCount > levels.length || showAll ? (
          <Button variant="ghost" size="xs" className="gap-1 px-1.5" onClick={onToggleShowAll}>
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

      <BandLegend />

      <div>
        {!hasReference && (
          <p className="px-4 pb-2 text-helper text-muted-foreground">
            Danışanın yaş/cinsiyet bilgisi eksik olduğu için referans karşılaştırması gösterilemiyor
            — değerler yine de listelendi.
          </p>
        )}
        <ul className="flex flex-col gap-0.5 px-4 pb-3">
          {levels.map((level) => {
            const def = nutrientDefByCode.get(level.nutrientCode)
            return (
              <NutrientLevelRow
                key={level.nutrientCode}
                name={def?.nameTr ?? level.nutrientCode}
                unit={def?.unit ?? ''}
                actualValue={level.actualValue}
                percentOfReference={level.percentOfReference}
                band={level.band}
              />
            )
          })}
          {levels.length === 0 && (
            <li className="text-helper text-muted-foreground">Henüz kalem eklenmedi.</li>
          )}
        </ul>
      </div>
    </div>
  )
}

// Erişilebilirlik anahtarı: hangi ikon hangi durumu gösteriyor. Renk körü bir
// kullanıcı satırdaki şekli buradan çözer.
function BandLegend() {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-2.5 gap-y-1 px-4 pt-1.5 pb-2">
      {BAND_ORDER.map((band) => {
        const Icon = BAND_ICON[band]
        return (
          // İkon RENKLİ, etiket NÖTR: anahtar satırı bir uyarı yığını gibi
          // görünmesin; okunan bilgi "bu şekil = bu durum" eşlemesi.
          <span key={band} className="flex items-center gap-0.5 text-helper text-muted-foreground">
            <Icon className={cn('size-3', BAND_TEXT_CLASS[band])} aria-hidden />
            {BAND_LABEL[band]}
          </span>
        )
      })}
    </div>
  )
}

function NutrientLevelRow({
  name,
  unit,
  actualValue,
  percentOfReference,
  band,
}: {
  name: string
  unit: string
  actualValue: number
  percentOfReference: number | null
  band: NutrientLevelBand
}) {
  const Icon = BAND_ICON[band]
  const statusText =
    percentOfReference !== null
      ? `${BAND_LABEL[band]} — referansın %${percentOfReference.toFixed(0)}'i`
      : BAND_LABEL[band]

  return (
    <li className="flex flex-col gap-1 rounded-md px-1 py-1 hover:bg-muted/50" title={statusText}>
      <div className="flex items-center gap-1.5">
        <Icon className={cn('size-3.5 shrink-0', BAND_TEXT_CLASS[band])} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-helper">{name}</span>
        <span className="shrink-0 text-helper tabular-nums text-muted-foreground">
          {actualValue.toFixed(1)} {unit}
        </span>
      </div>
      {/* GÖREV 3: "Referans yüzdesini çubukla göster, sayıyı yanında tut." */}
      <div className="flex items-center gap-2">
        <Progress
          value={percentOfReference === null ? 0 : Math.min(percentOfReference, 100)}
          className="h-1.5 flex-1"
          indicatorClassName={BAND_BAR_CLASS[band]}
          aria-label={`${name}: ${statusText}`}
        />
        <span
          className={cn('w-24 shrink-0 text-right text-helper tabular-nums', BAND_TEXT_CLASS[band])}
        >
          {percentOfReference !== null ? `%${percentOfReference.toFixed(0)}` : BAND_LABEL[band]}
        </span>
      </div>
    </li>
  )
}

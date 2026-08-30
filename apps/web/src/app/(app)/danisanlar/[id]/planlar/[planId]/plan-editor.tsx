'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import {
  ArrowLeft,
  CloudOff,
  Eye,
  FileDown,
  Layers,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Share2,
  SlidersHorizontal,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { computeDragEndPlan } from '@/lib/dnd-reorder'
import { cn } from '@/lib/utils'
import { useActiveMealStore } from '@/lib/stores/active-meal-store'
import { initFoodIndex } from '@/lib/food-index'
import { NavigationLink } from '@/components/navigation-link'
import type { PlanTree } from '@ogun/db/queries'
import type { ClientAllergenEntry, ClientSex, PdfDensity, PlanOutputFormat } from '@ogun/db/schema'
import { PLAN_OUTPUT_FORMAT_OPTIONS } from '@/lib/validation/plan-schemas'
import { usePlanEditorStore, type DraftDay, type PlanViewMode } from './plan-editor-store'
import { MealBlock } from './meal-block'
import { NutrientPanel } from './nutrient-panel'
import { ExchangePanel } from './exchange-panel'
import { OutputFormatPreviewDialog } from './output-format-preview-dialog'

export interface PlanEditorCloudDialogState {
  planId: string
  clientId: string
  currentPlanName: string
  templateDialogOpen: boolean
  setTemplateDialogOpen: (open: boolean) => void
  pdfDialogOpen: boolean
  setPdfDialogOpen: (open: boolean) => void
  shareDialogOpen: boolean
  setShareDialogOpen: (open: boolean) => void
}

export interface PlanEditorProps {
  planId: string
  clientId: string
  planName: string
  startDate: Date | null
  endDate: Date | null
  targetKcal: number | null
  // GitHub issue #28 / Prompt 5.6, GÖREV 4 — plan-level PDF çıktı formatı
  // tercihi (bkz. schema/plans.ts planOutputFormatEnum).
  outputFormat: PlanOutputFormat
  tree: PlanTree
  // GitHub issue #26 / Prompt 5.4 — canlı besin öğesi paneli için danışan
  // profili (yaş/cinsiyet referans karşılaştırması + alerji/intolerans
  // çakışması, bkz. plan-editor-store.ts useAllergenConflictMap).
  clientSex: ClientSex | null
  clientAge: number | null
  allergies: ClientAllergenEntry[] | null
  intolerances: ClientAllergenEntry[] | null
  // GitHub issue #35 / Prompt 6.1 — PDF diyaloğunun açılış değerleri
  // (klinik-varsayılanı, bkz. page.tsx notu).
  pdfDefaultDensity: PdfDensity
  pdfDefaultShowCalories: boolean
  // GitHub issue #36 / Prompt 6.2 — paylaşım diyaloğunun ihtiyaç duyduğu
  // danışan iletişim bilgileri (WhatsApp numarası/e-posta önerisi) + klinik
  // mesaj şablonu (bkz. /ayarlar/paylasim).
  clientName: string
  clientPhone: string | null
  clientEmail: string | null
  whatsappTemplate: string | null
  renderCloudDialogs?: (state: PlanEditorCloudDialogState) => ReactNode
}

// GitHub issue #25 / Prompt 5.3 — GÖREV 1: editör düzeni.
// - Üst: plan adı, tarih, hedef kalori, kaydet durumu, önizleme/PDF butonu.
// - Sol: öğün blokları listesi (dikey akış).
// - Sağ: sabit besin öğesi paneli (bkz. nutrient-panel.tsx).
// - Mobilde panel alta katlanır sekme olsun.
//
// GitHub issue #61 / Faz 10, Prompt 10.3 — ARAÇ ÇUBUĞU İKİ KATMANA AYRILDI.
// #25'ten beri her şey TEK bir `flex flex-wrap` satırındaydı: 5 eşit ağırlıklı
// buton + mod geçişi + çıktı formatı + 2 tarih + hedef kalori. Dizüstü
// genişliğinde üç satıra sarıyordu ve hiçbir eylem diğerinden daha önemli
// GÖRÜNMÜYORDU. Yeni hiyerarşi:
//   1. katman (her zaman görünür): ← geri, plan adı, kayıt durumu | mod
//      geçişi, "Plan ayarları", TEK birincil eylem ("Danışana ulaştır"),
//      taşma menüsü.
//   2. katman (açılınca görünür): plan üstverisi "Plan ayarları" popover'ında
//      (tarihler, hedef kalori, çıktı formatı, format önizlemesi); ikincil
//      eylemler ("PDF önizleme / indir", "Şablona dönüştür") taşma menüsünde.
// HİÇBİR İŞLEV KALDIRILMADI — hepsi bir tık ötede ve AYNI store action'larına
// bağlı (bkz. plan-editor-store.ts setPlanMeta).
export function PlanEditor(props: PlanEditorProps) {
  const {
    planId,
    clientId,
    planName,
    startDate,
    endDate,
    targetKcal,
    outputFormat,
    tree,
    clientSex,
    clientAge,
    allergies,
    intolerances,
    renderCloudDialogs,
  } = props
  const initialize = usePlanEditorStore((s) => s.initialize)
  const days = usePlanEditorStore((s) => s.days)
  const currentPlanName = usePlanEditorStore((s) => s.planName)
  const currentTargetKcal = usePlanEditorStore((s) => s.targetKcal)
  const currentStartDate = usePlanEditorStore((s) => s.startDate)
  const currentEndDate = usePlanEditorStore((s) => s.endDate)
  const currentOutputFormat = usePlanEditorStore((s) => s.outputFormat)
  const viewMode = usePlanEditorStore((s) => s.viewMode)
  const setViewMode = usePlanEditorStore((s) => s.setViewMode)
  const saveStatus = usePlanEditorStore((s) => s.saveStatus)
  const pendingCount = usePlanEditorStore((s) => s.pendingCount)
  const setPlanMeta = usePlanEditorStore((s) => s.setPlanMeta)
  const reorderMealItems = usePlanEditorStore((s) => s.reorderMealItems)
  const moveItemToMeal = usePlanEditorStore((s) => s.moveItemToMeal)
  const notifyOnline = usePlanEditorStore((s) => s.notifyOnline)
  const setOffline = usePlanEditorStore((s) => s.setOffline)
  const clearActiveMeal = useActiveMealStore((s) => s.clearActiveMeal)

  const [mobilePanelOpen, setMobilePanelOpen] = useState(false)
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false)
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false)
  const [shareDialogOpen, setShareDialogOpen] = useState(false)
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)

  useEffect(() => {
    initialize({
      planId,
      planName,
      startDate,
      endDate,
      targetKcal,
      outputFormat,
      tree,
      clientSex,
      clientAge,
      allergies,
      intolerances,
    })
    // Besin arama/miktar hesabı için offline indeksin (Dexie+Orama, #24)
    // hazır olduğundan emin ol — plan editörüne DOĞRUDAN bir link'ten (ör.
    // yer imi) gelindiyse komut paleti/FoodSearchInput henüz tetiklenmemiş
    // olabilir. NOT (#61): store'un resolveFoodMacros'u ARTIK bu çağrının
    // bitmesini beklemek zorunda değil — kendisi indeksin hazır olmasını
    // bekliyor (bkz. lib/food-index.ts whenFoodIndexReady).
    initFoodIndex().catch((error: unknown) =>
      console.error('[PlanEditor] besin indeksi yüklenemedi:', error),
    )
    // GÖREV 4: "Çevrimdışıyken düzenlemeye izin ver, bağlantı gelince
    // senkronize et" — bkz. lib/offline-queue.ts notifyOnline.
    function handleOnline() {
      void notifyOnline()
    }
    function handleOffline() {
      setOffline()
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    if (!navigator.onLine) setOffline()
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearActiveMeal()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId])

  // GitHub issue #61 / GÖREV 4 — DOKUNMATİK SÜRÜKLE-BIRAK DOĞRULAMASI.
  // dnd-kit'in PointerSensor'ü Pointer Events üzerinden çalışır, yani fare VE
  // dokunma girdisini TEK sensörle karşılar (ayrıca bir TouchSensor eklemek
  // aynı jesti iki kez tetikleme riski taşır — dnd-kit'in kendi önerisi
  // "PointerSensor" YA DA "MouseSensor + TouchSensor", ikisinin karışımı
  // değil). Dokunmanın gerçekten çalışması için gereken iki koşul da
  // sağlanıyor:
  //   1. sürükleme tutamağında `touch-none` (CSS touch-action: none) — bu
  //      olmadan tarayıcı jesti sayfa kaydırması sanar (bkz. plan-item-row.tsx)
  //   2. tutamağın dokunmatik cihazda GÖRÜNÜR olması — tutamak yalnızca
  //      hover'da beliriyordu, hover'ı olmayan cihazda hiç görünmüyordu;
  //      #61'de `pointer: coarse` medya sorgusuyla kalıcı görünür yapıldı.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const { itemsByMeal, itemMealOf } = useMemo(() => {
    const byMeal = new Map<string, string[]>()
    const mealOf = new Map<string, string>()
    for (const day of days) {
      for (const meal of day.meals) {
        byMeal.set(
          meal.id,
          meal.items.map((i) => i.id),
        )
        for (const item of meal.items) mealOf.set(item.id, meal.id)
      }
    }
    return { itemsByMeal: byMeal, itemMealOf: mealOf }
  }, [days])

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return
    const plan = computeDragEndPlan(
      { activeId: String(active.id), overId: String(over.id) },
      itemsByMeal,
      itemMealOf,
    )
    if (!plan) return
    if (!plan.sourceMealId) {
      reorderMealItems(plan.targetMealId, plan.targetOrderedIds)
      return
    }
    const toIndex = plan.targetOrderedIds.indexOf(String(active.id))
    moveItemToMeal(String(active.id), plan.sourceMealId, plan.targetMealId, toIndex)
  }

  const panel =
    viewMode === 'değişim' ? (
      <ExchangePanel targetKcal={currentTargetKcal} days={days} />
    ) : (
      <NutrientPanel targetKcal={currentTargetKcal} days={days} />
    )

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex flex-col gap-4 pb-24 lg:pb-0">
        <EditorTopBar
          clientId={clientId}
          planName={currentPlanName}
          startDate={currentStartDate}
          endDate={currentEndDate}
          targetKcal={currentTargetKcal}
          outputFormat={currentOutputFormat}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onOpenPreview={() => setPreviewDialogOpen(true)}
          onOpenPdfDialog={() => setPdfDialogOpen(true)}
          onOpenShareDialog={() => setShareDialogOpen(true)}
          onOpenTemplateDialog={() => setTemplateDialogOpen(true)}
          saveStatus={saveStatus}
          pendingCount={pendingCount}
          onCommit={setPlanMeta}
        />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex flex-col gap-4">
            {days.map((day) => (
              <DaySection key={day.id} day={day} showHeading={days.length > 1} />
            ))}
          </div>

          {/* Masaüstünde sabit sağ panel — GitHub issue #28 / Prompt 5.6,
              GÖREV 2: "Gram modundaki besin öğesi panelinin YERİNE geçer".
              AYNI reserved panel alanı (#25/#26), İÇERİK değişim moduna göre
              değişir. #61: genişlik 320 → 360px; besin öğesi satırı artık ad +
              değer + referans çubuğu + yüzde taşıyor ve 320px'de ad sütunu
              sürekli kırpılıyordu. */}
          <div className="hidden lg:block">
            <div className="sticky top-4">{panel}</div>
          </div>
        </div>

        {/* GÖREV 1: "Mobilde panel alta katlanır sekme olsun" — GitHub issue
            #61 / GÖREV 4'te satır içi açılır bölümden Sheet'e taşındı (#59'da
            eklenen bileşen). NOT: faz-10 spec'inin dosya başı uyarısı uyarınca
            uygulama artık masaüstü penceresi hedefliyor; bu şerit yalnızca dar
            pencereler için bir güvenlik ağı. */}
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background lg:hidden">
          <button
            type="button"
            className="flex w-full items-center justify-between px-4 py-2.5 text-body font-medium"
            onClick={() => setMobilePanelOpen(true)}
          >
            {viewMode === 'değişim' ? 'Değişim hedefleri paneli' : 'Besin öğesi paneli'}
            <Badge variant="secondary">Aç</Badge>
          </button>
        </div>
        <Sheet open={mobilePanelOpen} onOpenChange={setMobilePanelOpen}>
          <SheetContent side="bottom" className="max-h-[80svh] gap-0 lg:hidden">
            <SheetHeader className="pb-0">
              <SheetTitle>
                {viewMode === 'değişim' ? 'Değişim hedefleri paneli' : 'Besin öğesi paneli'}
              </SheetTitle>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">{panel}</div>
          </SheetContent>
        </Sheet>
      </div>

      <OutputFormatPreviewDialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen} />
      {/* GitHub issue #27 / Prompt 5.5, GÖREV 1 — "Mevcut planı şablona
          dönüştür". #61'de yalnızca TETİKLEYİCİSİ taşma menüsüne taşındı;
          diyalog (ve durumu) editörün kökünde duruyor. */}
      {renderCloudDialogs?.({ planId, clientId, currentPlanName, templateDialogOpen, setTemplateDialogOpen, pdfDialogOpen, setPdfDialogOpen, shareDialogOpen, setShareDialogOpen })}
    </DndContext>
  )
}

function DaySection({ day, showHeading }: { day: DraftDay; showHeading: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      {showHeading && (
        <h2 className="text-section text-muted-foreground">
          {day.dayLabel ?? `Gün ${day.dayNumber}`}
        </h2>
      )}
      {day.meals.map((meal) => (
        <MealBlock key={meal.id} meal={meal} />
      ))}
    </div>
  )
}

// GitHub issue #61 / GÖREV 1 — ÜST ŞERİT. Tek satır, sakin: solda gezinme +
// kimlik + kayıt durumu, sağda görünüm anahtarı + ayarlar + TEK birincil eylem
// + taşma menüsü. `flex-wrap` BİLEREK kaldırıldı — sarmayı imkânsız kılmak bu
// revizyonun asıl amacı; yalnızca plan adı esner, geri kalan her şey sabit
// genişlikli ve `shrink-0`.
function EditorTopBar({
  clientId,
  planName,
  startDate,
  endDate,
  targetKcal,
  outputFormat,
  viewMode,
  onViewModeChange,
  onOpenPreview,
  onOpenPdfDialog,
  onOpenShareDialog,
  onOpenTemplateDialog,
  saveStatus,
  pendingCount,
  onCommit,
}: {
  clientId: string
  planName: string
  startDate: Date | null
  endDate: Date | null
  targetKcal: number | null
  outputFormat: PlanOutputFormat
  viewMode: PlanViewMode
  onViewModeChange: (mode: PlanViewMode) => void
  onOpenPreview: () => void
  onOpenPdfDialog: () => void
  onOpenShareDialog: () => void
  onOpenTemplateDialog: () => void
  saveStatus: string
  pendingCount: number
  onCommit: (patch: {
    name?: string
    targetKcal?: number | null
    startDate?: Date | null
    endDate?: Date | null
    outputFormat?: PlanOutputFormat
  }) => void
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
      <Button
        asChild
        variant="ghost"
        size="icon-sm"
        aria-label="Danışana dön"
        title="Danışana dön"
      >
        <NavigationLink href={`/danisanlar/${clientId}?tab=planlar`}><ArrowLeft className="size-4" /></NavigationLink>
      </Button>
      {/* Plan adı satır içi düzenlenir (kaydet butonu YOK, bkz.
          SaveStatusIndicator). Üst şerit sakin dursun diye kenarlık yalnızca
          hover/odakta beliriyor — alan yine de gerçek bir <input>. */}
      <Input
        value={planName}
        onChange={(e) => onCommit({ name: e.target.value })}
        className="h-8 min-w-32 max-w-80 flex-1 border-transparent bg-transparent font-medium shadow-none hover:border-input focus-visible:border-input dark:bg-transparent"
        aria-label="Plan adı"
      />
      <SaveStatusIndicator status={saveStatus} pendingCount={pendingCount} />

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {/* GitHub issue #28 / Prompt 5.6, GÖREV 1 — "Gram modu" / "Değişim
            modu" geçişi. #61'de üst şeritte KALDI: sık kullanılan bir görünüm
            anahtarı bir menünün arkasına saklanamaz. */}
        <ViewModeToggle viewMode={viewMode} onChange={onViewModeChange} />
        <PlanSettingsPopover
          startDate={startDate}
          endDate={endDate}
          targetKcal={targetKcal}
          outputFormat={outputFormat}
          onCommit={onCommit}
          onOpenPreview={onOpenPreview}
        />
        {/* GitHub issue #36 / Prompt 6.2 — "Danışana ulaştırma": paylaşım
            linki + WhatsApp/e-posta gönderimi (bkz. share-dialog.tsx). #61:
            bu ekranın TEK birincil eylemi — planın gitmesi gereken yer. */}
        <Button size="sm" className="gap-1.5" onClick={onOpenShareDialog}>
          <Share2 className="size-3.5" />
          Danışana ulaştır
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Diğer plan eylemleri">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Diğer eylemler</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {/* GitHub issue #35 / Prompt 6.1 — gerçek PDF diyaloğu
                (plan-pdf-dialog.tsx). */}
            <DropdownMenuItem onSelect={onOpenPdfDialog}>
              <FileDown className="size-4" />
              PDF önizleme / indir
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onOpenTemplateDialog}>
              <Layers className="size-4" />
              Şablona dönüştür
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

// GitHub issue #61 / GÖREV 1 — "Plan üstverisi (tarihler, hedef kalori, çıktı
// formatı) → katlanabilir bir 'Plan ayarları' popover'ına al. Bunlar plan
// başında bir kez ayarlanıyor, her an görünür olmalarına gerek yok."
// Alanlar AYNI onCommit (setPlanMeta) akışına bağlı — yalnızca YERLERİ değişti,
// davranışları (anında kaydetme, offline kuyruğu) aynı.
function PlanSettingsPopover({
  startDate,
  endDate,
  targetKcal,
  outputFormat,
  onCommit,
  onOpenPreview,
}: {
  startDate: Date | null
  endDate: Date | null
  targetKcal: number | null
  outputFormat: PlanOutputFormat
  onCommit: (patch: {
    targetKcal?: number | null
    startDate?: Date | null
    endDate?: Date | null
    outputFormat?: PlanOutputFormat
  }) => void
  onOpenPreview: () => void
}) {
  // Tetikleyicide bir özet kalıyor: hedef kalori panelin TÜM referans
  // karşılaştırmasını belirlediği için "hedef girilmiş miydi?" sorusunun
  // cevabı popover açılmadan da görünmeli.
  const summary = targetKcal !== null ? `${targetKcal} kcal` : 'Hedef yok'

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <SlidersHorizontal className="size-3.5" />
          Plan ayarları
          <span className="text-data text-muted-foreground">{summary}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3">
        <PopoverHeader>
          <PopoverTitle>Plan ayarları</PopoverTitle>
          <PopoverDescription>
            Plan başında bir kez ayarlanır; değişiklikler anında kaydedilir.
          </PopoverDescription>
        </PopoverHeader>
        <div className="flex flex-col gap-2.5">
          <DateField
            label="Başlangıç"
            value={startDate}
            onChange={(d) => onCommit({ startDate: d })}
          />
          <DateField label="Bitiş" value={endDate} onChange={(d) => onCommit({ endDate: d })} />
          <label className="flex items-center justify-between gap-2">
            <span className="text-helper text-muted-foreground">Hedef kalori</span>
            <Input
              type="number"
              min={0}
              value={targetKcal ?? ''}
              onChange={(e) =>
                onCommit({ targetKcal: e.target.value === '' ? null : Number(e.target.value) })
              }
              className="h-7 w-36 text-data"
            />
          </label>
          <div className="flex items-center justify-between gap-2">
            <span className="text-helper text-muted-foreground">Çıktı formatı</span>
            <Select
              value={outputFormat}
              onValueChange={(value) => onCommit({ outputFormat: value as PlanOutputFormat })}
            >
              <SelectTrigger className="h-7 w-36 text-helper" aria-label="Çıktı formatı">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLAN_OUTPUT_FORMAT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-1.5"
            onClick={onOpenPreview}
          >
            <Eye className="size-3.5" />
            Önizleme (demo)
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string
  value: Date | null
  onChange: (d: Date | null) => void
}) {
  const isoValue = value ? value.toISOString().slice(0, 10) : ''
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-helper text-muted-foreground">{label}</span>
      <Input
        type="date"
        value={isoValue}
        onChange={(e) => onChange(e.target.value ? new Date(e.target.value) : null)}
        className="h-7 w-36 text-data"
      />
    </label>
  )
}

// GitHub issue #28 / Prompt 5.6, GÖREV 1 — "Gram modu" / "Değişim modu"
// geçişi. İki butonlu bir segment kontrolü — Select yerine BİLEREK bunlar
// seçildi: sadece 2 seçenek var ve sık değiştirilmesi beklenen bir görünüm
// anahtarı (bir dropdown açıp seçmek yerine tek tıkla geçiş).
function ViewModeToggle({
  viewMode,
  onChange,
}: {
  viewMode: PlanViewMode
  onChange: (mode: PlanViewMode) => void
}) {
  return (
    <div className="inline-flex shrink-0 rounded-lg border border-border p-0.5">
      <button
        type="button"
        onClick={() => onChange('gram')}
        className={cn(
          'rounded-md px-2.5 py-1 text-helper font-medium transition-colors',
          viewMode === 'gram'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        Gram modu
      </button>
      <button
        type="button"
        onClick={() => onChange('değişim')}
        className={cn(
          'rounded-md px-2.5 py-1 text-helper font-medium transition-colors',
          viewMode === 'değişim'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        Değişim modu
      </button>
    </div>
  )
}

// GÖREV 4: "'Kaydediliyor...' / 'Kaydedildi' / 'Bağlantı yok, yerel kayıt'
// göstergesi." — KAYDET BUTONU YOK, sadece durum.
function SaveStatusIndicator({ status, pendingCount }: { status: string; pendingCount: number }) {
  if (status === 'offline') {
    return (
      <Badge variant="destructive" className="shrink-0 gap-1">
        <CloudOff className="size-3" />
        Bağlantı yok, yerel kayıt{pendingCount > 0 ? ` (${pendingCount} bekliyor)` : ''}
      </Badge>
    )
  }
  if (status === 'saving') {
    return (
      <Badge variant="secondary" className="shrink-0 gap-1">
        <Loader2 className="size-3 animate-spin" />
        Kaydediliyor…
      </Badge>
    )
  }
  if (status === 'error') {
    return (
      <Badge variant="destructive" className="shrink-0 gap-1">
        <RefreshCw className="size-3" />
        Kaydedilemedi, tekrar denenecek
      </Badge>
    )
  }
  if (status === 'saved') {
    return (
      <Badge variant="outline" className="shrink-0">
        Kaydedildi
      </Badge>
    )
  }
  return null
}

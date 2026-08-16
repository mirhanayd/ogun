'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { CloudOff, Eye, FileDown, Layers, Loader2, RefreshCw, Share2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { computeDragEndPlan } from '@/lib/dnd-reorder'
import { cn } from '@/lib/utils'
import { useActiveMealStore } from '@/lib/stores/active-meal-store'
import { initFoodIndex } from '@/lib/food-index'
import type { PlanTree } from '@ogun/db/queries'
import type { ClientAllergenEntry, ClientSex, PdfDensity, PlanOutputFormat } from '@ogun/db/schema'
import { PLAN_OUTPUT_FORMAT_OPTIONS } from '@/lib/validation/plan-schemas'
import { usePlanEditorStore, type DraftDay, type PlanViewMode } from './plan-editor-store'
import { MealBlock } from './meal-block'
import { NutrientPanel } from './nutrient-panel'
import { ExchangePanel } from './exchange-panel'
import { SaveAsTemplateDialog } from './save-as-template-dialog'
import { OutputFormatPreviewDialog } from './output-format-preview-dialog'
import { PlanPdfDialog } from './plan-pdf-dialog'
import { ShareDialog } from './share-dialog'

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
}

// GitHub issue #25 / Prompt 5.3 — GÖREV 1: editör düzeni.
// - Üst: plan adı, tarih, hedef kalori, kaydet durumu, önizleme/PDF butonu.
// - Sol: öğün blokları listesi (dikey akış).
// - Sağ: sabit besin öğesi paneli (Prompt 5.4'te dolduracağız, şimdilik yer
//   tutucu — bkz. nutrient-panel.tsx).
// - Mobilde panel alta katlanır sekme olsun.
export function PlanEditor({
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
  pdfDefaultDensity,
  pdfDefaultShowCalories,
  clientName,
  clientPhone,
  clientEmail,
  whatsappTemplate,
}: PlanEditorProps) {
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
    // olabilir.
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

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex flex-col gap-3 pb-24 lg:pb-0">
        <EditorTopBar
          planId={planId}
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
          saveStatus={saveStatus}
          pendingCount={pendingCount}
          onCommit={setPlanMeta}
        />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
          <div className="flex flex-col gap-3">
            {days.map((day) => (
              <DaySection key={day.id} day={day} showHeading={days.length > 1} />
            ))}
          </div>

          {/* Masaüstünde sabit sağ panel — GitHub issue #28 / Prompt 5.6,
              GÖREV 2: "Gram modundaki besin öğesi panelinin YERİNE geçer".
              AYNI reserved panel alanı (#25/#26), İÇERİK değişim moduna göre
              değişir. */}
          <div className="hidden lg:block">
            <div className="sticky top-4">
              {viewMode === 'değişim' ? (
                <ExchangePanel targetKcal={currentTargetKcal} days={days} />
              ) : (
                <NutrientPanel targetKcal={currentTargetKcal} days={days} />
              )}
            </div>
          </div>
        </div>

        {/* GÖREV 1: "Mobilde panel alta katlanır sekme olsun" */}
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background lg:hidden">
          <button
            type="button"
            className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-medium"
            onClick={() => setMobilePanelOpen((v) => !v)}
          >
            {viewMode === 'değişim' ? 'Değişim hedefleri paneli' : 'Besin öğesi paneli'}
            <Badge variant="secondary">{mobilePanelOpen ? 'Kapat' : 'Aç'}</Badge>
          </button>
          {mobilePanelOpen && (
            <div className="max-h-[60vh] overflow-y-auto border-t border-border p-3">
              {viewMode === 'değişim' ? (
                <ExchangePanel targetKcal={currentTargetKcal} days={days} />
              ) : (
                <NutrientPanel targetKcal={currentTargetKcal} days={days} />
              )}
            </div>
          )}
        </div>
      </div>

      <OutputFormatPreviewDialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen} />
      <PlanPdfDialog
        open={pdfDialogOpen}
        onOpenChange={setPdfDialogOpen}
        planId={planId}
        clientId={clientId}
        defaultDensity={pdfDefaultDensity}
        defaultShowCalories={pdfDefaultShowCalories}
      />
      <ShareDialog
        open={shareDialogOpen}
        onOpenChange={setShareDialogOpen}
        planId={planId}
        clientId={clientId}
        planName={currentPlanName}
        clientName={clientName}
        clientPhone={clientPhone}
        clientEmail={clientEmail}
        whatsappTemplate={whatsappTemplate}
      />
    </DndContext>
  )
}

function DaySection({ day, showHeading }: { day: DraftDay; showHeading: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      {showHeading && (
        <h2 className="text-sm font-semibold text-muted-foreground">
          {day.dayLabel ?? `Gün ${day.dayNumber}`}
        </h2>
      )}
      {day.meals.map((meal) => (
        <MealBlock key={meal.id} meal={meal} />
      ))}
    </div>
  )
}

function EditorTopBar({
  planId,
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
  saveStatus,
  pendingCount,
  onCommit,
}: {
  planId: string
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
  const router = useRouter()
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/danisanlar/${clientId}?tab=planlar`)}
        >
          ← Danışana dön
        </Button>
        <Input
          value={planName}
          onChange={(e) => onCommit({ name: e.target.value })}
          className="h-8 max-w-72 min-w-32 flex-1 font-medium"
          aria-label="Plan adı"
        />
        <SaveStatusIndicator status={saveStatus} pendingCount={pendingCount} />
        {/* GitHub issue #27 / Prompt 5.5, GÖREV 1 — "Mevcut planı şablona
            dönüştür". */}
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => setTemplateDialogOpen(true)}
        >
          <Layers className="size-3.5" />
          Şablona dönüştür
        </Button>
        <SaveAsTemplateDialog
          planId={planId}
          currentPlanName={planName}
          open={templateDialogOpen}
          onOpenChange={setTemplateDialogOpen}
        />
        {/* GitHub issue #35 / Prompt 6.1 — #25'in "yakında" bıraktığı stub
            burada GERÇEK bir diyaloğa bağlandı (bkz. plan-pdf-dialog.tsx). */}
        <Button variant="outline" size="sm" className="gap-1.5" onClick={onOpenPdfDialog}>
          <FileDown className="size-3.5" />
          PDF önizleme / indir
        </Button>
        {/* GitHub issue #36 / Prompt 6.2 — "Danışana ulaştırma": paylaşım
            linki + WhatsApp/e-posta gönderimi (bkz. share-dialog.tsx). */}
        <Button variant="outline" size="sm" className="gap-1.5" onClick={onOpenShareDialog}>
          <Share2 className="size-3.5" />
          Danışana ulaştır
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {/* GitHub issue #28 / Prompt 5.6, GÖREV 1 — "Gram modu" / "Değişim
            modu" geçişi, plan editörü üstünde. */}
        <ViewModeToggle viewMode={viewMode} onChange={onViewModeChange} />
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Çıktı formatı</span>
          <Select
            value={outputFormat}
            onValueChange={(value) => onCommit({ outputFormat: value as PlanOutputFormat })}
          >
            <SelectTrigger className="h-7 w-auto text-xs" aria-label="Çıktı formatı">
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
          <Button variant="ghost" size="sm" className="h-7 gap-1 px-2" onClick={onOpenPreview}>
            <Eye className="size-3.5" />
            Önizleme (demo)
          </Button>
        </div>
        <DateField
          label="Başlangıç"
          value={startDate}
          onChange={(d) => onCommit({ startDate: d })}
        />
        <DateField label="Bitiş" value={endDate} onChange={(d) => onCommit({ endDate: d })} />
        <label className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Hedef kalori</span>
          <Input
            type="number"
            min={0}
            value={targetKcal ?? ''}
            onChange={(e) =>
              onCommit({ targetKcal: e.target.value === '' ? null : Number(e.target.value) })
            }
            className="h-7 w-24"
          />
        </label>
      </div>
    </div>
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
    <label className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Input
        type="date"
        value={isoValue}
        onChange={(e) => onChange(e.target.value ? new Date(e.target.value) : null)}
        className="h-7 w-36"
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
    <div className="inline-flex rounded-lg border border-border p-0.5">
      <button
        type="button"
        onClick={() => onChange('gram')}
        className={cn(
          'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
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
          'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
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
      <Badge variant="destructive" className="gap-1">
        <CloudOff className="size-3" />
        Bağlantı yok, yerel kayıt{pendingCount > 0 ? ` (${pendingCount} bekliyor)` : ''}
      </Badge>
    )
  }
  if (status === 'saving') {
    return (
      <Badge variant="secondary" className="gap-1">
        <Loader2 className="size-3 animate-spin" />
        Kaydediliyor…
      </Badge>
    )
  }
  if (status === 'error') {
    return (
      <Badge variant="destructive" className="gap-1">
        <RefreshCw className="size-3" />
        Kaydedilemedi, tekrar denenecek
      </Badge>
    )
  }
  if (status === 'saved') {
    return <Badge variant="outline">Kaydedildi</Badge>
  }
  return null
}

'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Bookmark } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FoodSearchInput } from '@/components/food-search-input'
import { PLAN_MEAL_TYPE_OPTIONS } from '@/lib/validation/plan-schemas'
import { computeMealNutrientTotals, type MealTotals } from '@/lib/plan-nutrients'
import { useActiveMealStore } from '@/lib/stores/active-meal-store'
import { mealContainerId } from '@/lib/dnd-reorder'
import type { DraftMeal } from './plan-editor-store'
import { usePlanEditorStore } from './plan-editor-store'
import { PlanItemRow } from './plan-item-row'
import { SaveMealDialog } from './save-meal-dialog'

// GitHub issue #25 / Prompt 5.3 — GÖREV 2: öğün bloğu bileşeni.
export function MealBlock({ meal }: { meal: DraftMeal }) {
  const setMealMeta = usePlanEditorStore((s) => s.setMealMeta)
  const addItemFromSelection = usePlanEditorStore((s) => s.addItemFromSelection)
  const insertSavedMeal = usePlanEditorStore((s) => s.insertSavedMeal)
  const foodMacros = usePlanEditorStore((s) => s.foodMacros)
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)

  const { setNodeRef: setDroppableRef } = useDroppable({ id: mealContainerId(meal.id) })
  const setActiveMeal = useActiveMealStore((s) => s.setActiveMeal)

  function handleInsertSavedMeal(savedMealId: string) {
    insertSavedMeal(meal.id, savedMealId).catch((error: unknown) => {
      toast.error(error instanceof Error ? error.message : 'Kayıtlı öğün eklenemedi.')
    })
  }

  const mealTypeLabel =
    PLAN_MEAL_TYPE_OPTIONS.find((o) => o.value === meal.mealType)?.label ?? meal.mealType

  // GitHub issue #25 — bkz. lib/stores/active-meal-store.ts dosya başı notu:
  // bu öğün bloğu odak aldığında (ör. arama kutusuna tıklandığında) komut
  // paletinin "aktif öğüne ekle" mekanizmasına kaydolur.
  const registerActive = () => {
    setActiveMeal(meal.id, `${mealTypeLabel} (${meal.name})`, (hit) => {
      addItemFromSelection(meal.id, {
        foodId: hit.id,
        nameTr: hit.nameTr,
        groupNameTr: hit.groupNameTr,
        kcalPer100g: hit.kcalPer100g,
        proteinPer100g: hit.proteinPer100g,
        carbPer100g: hit.carbPer100g,
        fatPer100g: hit.fatPer100g,
        defaultPortion: hit.defaultPortion,
        amount: 1,
      })
    })
  }

  const totals = useMemo<MealTotals>(() => {
    const lookup = new Map(Object.entries(foodMacros))
    return computeMealNutrientTotals(
      meal.items.map((item) => ({ foodId: item.foodId, amountGrams: item.amountGrams })),
      lookup,
    )
  }, [meal.items, foodMacros])

  const itemIds = meal.items.map((item) => item.id)

  return (
    // GitHub issue #61 / Faz 10, Prompt 10.3, GÖREV 2 — DİKEY RİTİM.
    // Blok içindeki boşluklar `mt-2` / `py-2` / `gap-0.5` karışımıydı; iki
    // öğün bloğu arasındaki mesafe (plan-editor.tsx DaySection) blok İÇİ
    // mesafeyle neredeyse aynıydı ve gruplar birbirine yapışıyordu. Artık tek
    // bir ölçü var: blok içi `gap-2` (8px), bloklar arası `gap-4` (16px).
    <div
      ref={setDroppableRef}
      className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3"
      onFocus={registerActive}
      onClick={registerActive}
    >
      <MealHeader
        meal={meal}
        mealTypeLabel={mealTypeLabel}
        totals={totals}
        onSave={(patch) => setMealMeta(meal.id, patch)}
        onSaveAsMealLibraryEntry={() => setSaveDialogOpen(true)}
      />

      {/* GitHub issue #27 / Prompt 5.5, GÖREV 3 — "öğün bloğunda 'kaydet'
          ikonu". */}
      <SaveMealDialog
        mealId={meal.id}
        defaultName={`${meal.name} (kayıtlı öğün)`}
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
      />

      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-col">
          {meal.items.map((item) => (
            <PlanItemRow key={item.id} item={item} foodMacros={foodMacros} />
          ))}
        </ul>
      </SortableContext>

      {meal.items.length === 0 && (
        <p className="px-1.5 py-1 text-helper text-muted-foreground">
          Bu öğüne henüz kalem eklenmedi.
        </p>
      )}

      {/* GÖREV 2: "Blok sonunda hep açık bir arama kutusu (yeni kalem eklemek
          için ekstra tık olmasın)" — FoodSearchInput HER ZAMAN görünür, hiç
          gizli/kapalı bir "ekle" butonu YOK. */}
      <div>
        <FoodSearchInput
          placeholder={`${mealTypeLabel} için besin ara… (ör. "150 gr tavuk göğsü", "@" ile kayıtlı öğün)`}
          onSelect={(selection) => addItemFromSelection(meal.id, selection)}
          onInsertSavedMeal={handleInsertSavedMeal}
        />
      </div>
    </div>
  )
}

function MealHeader({
  meal,
  mealTypeLabel,
  totals,
  onSave,
  onSaveAsMealLibraryEntry,
}: {
  meal: DraftMeal
  mealTypeLabel: string
  totals: MealTotals
  onSave: (patch: { name?: string; time?: string | null }) => void
  onSaveAsMealLibraryEntry: () => void
}) {
  return (
    // GitHub issue #61 — başlık satırı da kalem satırlarıyla AYNI ritmi
    // izlesin diye sabit yükseklikli (min-h-8) ve `flex-wrap` YOK: öğün
    // toplamları (sağ blok) sarmayacak şekilde `shrink-0`, yalnızca öğün adı
    // esner.
    <div className="flex min-h-8 items-center gap-2">
      <Badge variant="secondary" className="shrink-0">
        {mealTypeLabel}
      </Badge>
      <InlineText
        value={meal.name}
        onCommit={(name) => onSave({ name })}
        className="min-w-20 flex-1 text-body font-medium"
      />
      <InlineTime value={meal.time} onCommit={(time) => onSave({ time })} />
      {/* GÖREV 3 — bu öğünü "öğün blokları kütüphanesi"ne kaydet. Boş bir
          öğün kaydedilemez (bkz. queries/saved-meals.ts createSavedMealFromMeal),
          bu yüzden hiç kalem yoksa buton devre dışı bırakılır. */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-7 shrink-0"
        title="Öğün blokları kütüphanesine kaydet"
        disabled={meal.items.length === 0}
        onClick={onSaveAsMealLibraryEntry}
      >
        <Bookmark className="size-3.5" />
      </Button>
      {/* Öğün toplamları — `tabular-nums` (text-data) ve sabit genişlikli
          rozetler: sayılar değiştikçe (canlı hesap) rozetlerin genişliği
          değişip başlık satırı zıplıyordu. */}
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <Badge variant="outline" className="w-20 justify-center text-data">
          {totals.kcalTotal.toFixed(0)} kcal
        </Badge>
        <Badge variant="outline" className="w-14 justify-center text-data">
          P {totals.proteinGrams.toFixed(0)}g
        </Badge>
        <Badge variant="outline" className="w-14 justify-center text-data">
          K {totals.carbGrams.toFixed(0)}g
        </Badge>
        <Badge variant="outline" className="w-14 justify-center text-data">
          Y {totals.fatGrams.toFixed(0)}g
        </Badge>
        {totals.uncalculatedItemCount > 0 && (
          <Badge
            variant="destructive"
            className="text-helper"
            title="Bu kalemler serbest metin/tarif olduğu veya besin verisi eksik olduğu için toplama dahil değil"
          >
            {totals.uncalculatedItemCount} kalem hesap dışı
          </Badge>
        )}
      </div>
    </div>
  )
}

// GÖREV 2: "Başlık (düzenlenebilir)... Tıkla, düzenle, Tab ile geç" — öğün
// başlığı da AYNI tıkla-düzenle-blur/Tab'de-kaydet deseniyle çalışır
// (bkz. plan-item-row.tsx AmountEditor — AYNI desen burada metin için).
function InlineText({
  value,
  onCommit,
  className,
}: {
  value: string
  onCommit: (value: string) => void
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => setDraft(value), [value])

  if (!editing) {
    return (
      <button
        type="button"
        className={`truncate rounded px-1 py-0.5 text-left hover:bg-muted ${className ?? ''}`}
        onClick={() => {
          setEditing(true)
          requestAnimationFrame(() => inputRef.current?.select())
        }}
      >
        {value}
      </button>
    )
  }

  function commit() {
    setEditing(false)
    const trimmed = draft.trim()
    if (trimmed && trimmed !== value) onCommit(trimmed)
  }

  return (
    <Input
      ref={inputRef}
      value={draft}
      className={`h-7 ${className ?? ''}`}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'Tab') commit()
        if (e.key === 'Escape') {
          setDraft(value)
          setEditing(false)
        }
      }}
    />
  )
}

function InlineTime({
  value,
  onCommit,
}: {
  value: string | null
  onCommit: (value: string | null) => void
}) {
  return (
    <Input
      type="time"
      value={value ?? ''}
      className="h-7 w-24 shrink-0"
      onChange={(e) => onCommit(e.target.value || null)}
    />
  )
}

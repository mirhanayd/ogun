'use client'

import { useRef, useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Plus, ShieldAlert, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FoodSearchInput } from '@/components/food-search-input'
import { cn } from '@/lib/utils'
import type { DraftAlternative, DraftItem } from './plan-editor-store'
import { useAllergenConflictMap, useFoodExchangeMap, usePlanEditorStore } from './plan-editor-store'
import type { FoodMacroLookup } from '@/lib/plan-nutrients'
import { convertExchangeCountToGrams, convertItemToExchange } from '@/lib/plan-exchanges'

// GitHub issue #25 / Prompt 5.3 — GÖREV 2 + GÖREV 3:
// - "Satır içi düzenleme — modal AÇMA. Tıkla, düzenle, Tab ile geç."
// - "Kalemin altında 'veya' satırları, girintili gösterim. Kaleme hover'da
//   beliren '+ alternatif' butonu."
export function PlanItemRow({
  item,
  foodMacros,
}: {
  item: DraftItem
  foodMacros: Record<string, FoodMacroLookup>
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    data: { mealId: item.mealId },
  })
  const updateItemAmount = usePlanEditorStore((s) => s.updateItemAmount)
  const removeItemById = usePlanEditorStore((s) => s.removeItemById)
  const addAlternativeFromSelection = usePlanEditorStore((s) => s.addAlternativeFromSelection)
  const allergenConflicts = useAllergenConflictMap()
  // GitHub issue #28 / Prompt 5.6, GÖREV 1 — "Değişim modunda kalemler gram
  // yerine değişim cinsinden girilir/gösterilir. Aynı plan verisi, farklı
  // görünüm — şemada ayrı kayıt tutma." updateItemAmount (yukarısı) BURADA
  // DEĞİŞMEDİ — hâlâ HER ZAMAN gram alır/yazar; değişim modunda sadece
  // GİRİŞ/ÇIKIŞ dönüşümü (bkz. ExchangeAmountEditor) araya giriyor.
  const viewMode = usePlanEditorStore((s) => s.viewMode)
  const foodExchangeMap = useFoodExchangeMap()

  const [showAltSearch, setShowAltSearch] = useState(false)
  const isPending = item.id.startsWith('temp-')

  const macro = item.foodId ? foodMacros[item.foodId] : undefined
  const displayName =
    macro?.nameTr ?? item.freeText ?? (item.recipeId ? 'Tarif' : 'Bilinmeyen besin')
  const kcal =
    macro?.kcalPer100g !== undefined && macro?.kcalPer100g !== null
      ? (macro.kcalPer100g * item.amountGrams) / 100
      : null
  // GitHub issue #26 / Prompt 5.4, GÖREV 3 — "Alerji/intolerans çakışması →
  // kalem satırında kırmızı ikon".
  const conflicts = item.foodId ? allergenConflicts.get(item.foodId) : undefined

  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        'group/item rounded-md border border-transparent px-1.5 py-1 hover:border-border',
        isDragging && 'opacity-50',
      )}
    >
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="cursor-grab touch-none text-muted-foreground opacity-0 group-hover/item:opacity-100"
          aria-label="Sürükle"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>

        <span
          className={cn(
            'min-w-0 flex-1 truncate text-sm',
            isPending && 'text-muted-foreground italic',
          )}
        >
          {displayName}
          {isPending && ' (kaydediliyor…)'}
        </span>

        {conflicts && conflicts.length > 0 && (
          <ShieldAlert
            className="size-3.5 shrink-0 text-destructive"
            aria-label={`Alerji/intolerans çakışması: ${conflicts.map((c) => c.entry.label).join(', ')}`}
          >
            <title>{`Alerji/intolerans çakışması: ${conflicts.map((c) => c.entry.label).join(', ')}`}</title>
          </ShieldAlert>
        )}

        {viewMode === 'değişim' ? (
          <ExchangeAmountEditor
            item={item}
            foodExchangeMap={foodExchangeMap}
            disabled={isPending}
            onCommit={(grams) => updateItemAmount(item.id, grams)}
          />
        ) : (
          <AmountEditor
            amountGrams={item.amountGrams}
            disabled={isPending}
            onCommit={(grams) => updateItemAmount(item.id, grams)}
          />
        )}

        <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
          {kcal !== null ? `${kcal.toFixed(0)} kcal` : '—'}
        </span>

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="opacity-0 group-hover/item:opacity-100"
          onClick={() => setShowAltSearch((v) => !v)}
          disabled={isPending}
          title="Alternatif ekle"
        >
          <Plus className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground opacity-0 hover:text-destructive group-hover/item:opacity-100"
          onClick={() => removeItemById(item.id)}
          title="Kalemi sil"
        >
          <X className="size-3.5" />
        </Button>
      </div>

      {item.note && <p className="ml-6 text-xs text-muted-foreground">{item.note}</p>}

      {item.alternatives.length > 0 && (
        <ul className="ml-6 mt-1 flex flex-col gap-0.5 border-l border-dashed border-border pl-2">
          {item.alternatives.map((alt) => (
            <AlternativeRow key={alt.id} alternative={alt} foodMacros={foodMacros} />
          ))}
        </ul>
      )}

      {showAltSearch && (
        <div className="ml-6 mt-1">
          <FoodSearchInput
            placeholder="Alternatif besin ara…"
            autoFocus
            onSelect={(selection) => {
              addAlternativeFromSelection(item.id, selection)
              setShowAltSearch(false)
            }}
          />
        </div>
      )}
    </li>
  )
}

function AlternativeRow({
  alternative,
  foodMacros,
}: {
  alternative: DraftAlternative
  foodMacros: Record<string, FoodMacroLookup>
}) {
  const removeAlternativeById = usePlanEditorStore((s) => s.removeAlternativeById)
  const macro = alternative.foodId ? foodMacros[alternative.foodId] : undefined
  const displayName = macro?.nameTr ?? alternative.freeText ?? 'Bilinmeyen besin'
  const isPending = alternative.id.startsWith('temp-')

  return (
    <li className="group/alt flex items-center gap-1.5 text-xs text-muted-foreground">
      <Badge variant="outline" className="h-4 px-1 text-[0.65rem]">
        veya
      </Badge>
      <span className={cn('flex-1 truncate', isPending && 'italic')}>
        {displayName} — {alternative.amountGrams} g
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="size-5 opacity-0 hover:text-destructive group-hover/alt:opacity-100"
        onClick={() => removeAlternativeById(alternative.id)}
        title="Alternatifi sil"
      >
        <X className="size-3" />
      </Button>
    </li>
  )
}

// GÖREV 2: "Tıkla, düzenle, Tab ile geç" — miktar tıklanana kadar düz metin
// gibi görünür, tıklanınca gerçek bir <Input type=number> olur; Tab/Enter/blur
// commit eder. MODAL YOK.
function AmountEditor({
  amountGrams,
  disabled,
  onCommit,
}: {
  amountGrams: number
  disabled?: boolean
  onCommit: (grams: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(String(amountGrams))
  const inputRef = useRef<HTMLInputElement>(null)

  if (!editing) {
    return (
      <button
        type="button"
        disabled={disabled}
        className="w-16 shrink-0 rounded px-1 text-right text-sm hover:bg-muted disabled:opacity-50"
        onClick={() => {
          setValue(String(amountGrams))
          setEditing(true)
          requestAnimationFrame(() => inputRef.current?.select())
        }}
      >
        {amountGrams} g
      </button>
    )
  }

  function commit() {
    const parsed = Number(value.replace(',', '.'))
    setEditing(false)
    if (Number.isFinite(parsed) && parsed > 0) onCommit(parsed)
  }

  return (
    <Input
      ref={inputRef}
      type="number"
      min={0}
      step="0.1"
      value={value}
      className="h-7 w-16 px-1 text-right text-sm"
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === 'Tab') {
          commit()
        }
        if (event.key === 'Escape') setEditing(false)
      }}
    />
  )
}

// GitHub issue #28 / Prompt 5.6, GÖREV 1 — AmountEditor'ün AYNI "tıkla,
// düzenle" deseni, DEĞERİ gram yerine değişim adedi olarak gösterip alan.
// Besinin bir değişim grubu eşleşmesi YOKSA (foodExchangeMap'te null/eksik)
// dönüşüm YAPILAMAZ — bu durumda AmountEditor'e (gram) DÜŞER, kullanıcı
// değişim modundayken bile bu kalemi gram olarak görür/düzenler (sessizce
// yanlış bir "0 değişim" göstermek yerine — sınıfsal olarak "veri eksik" ile
// "değer sıfır" AYNI karışıklığı, bkz. nutrition-core warnings.ts).
function ExchangeAmountEditor({
  item,
  foodExchangeMap,
  disabled,
  onCommit,
}: {
  item: DraftItem
  foodExchangeMap: ReturnType<typeof useFoodExchangeMap>
  disabled?: boolean
  onCommit: (grams: number) => void
}) {
  const converted = convertItemToExchange(
    { foodId: item.foodId, amountGrams: item.amountGrams },
    foodExchangeMap,
  )

  if (!converted) {
    return <AmountEditor amountGrams={item.amountGrams} disabled={disabled} onCommit={onCommit} />
  }

  const info = foodExchangeMap.get(item.foodId ?? '')
  if (!info) {
    return <AmountEditor amountGrams={item.amountGrams} disabled={disabled} onCommit={onCommit} />
  }

  return (
    <ExchangeCountInput
      exchangeCount={converted.exchangeCount}
      disabled={disabled}
      onCommit={(exchangeCount) => onCommit(convertExchangeCountToGrams(exchangeCount, info))}
    />
  )
}

function ExchangeCountInput({
  exchangeCount,
  disabled,
  onCommit,
}: {
  exchangeCount: number
  disabled?: boolean
  onCommit: (exchangeCount: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(String(Math.round(exchangeCount * 10) / 10))
  const inputRef = useRef<HTMLInputElement>(null)

  if (!editing) {
    return (
      <button
        type="button"
        disabled={disabled}
        className="w-20 shrink-0 rounded px-1 text-right text-sm hover:bg-muted disabled:opacity-50"
        onClick={() => {
          setValue(String(Math.round(exchangeCount * 10) / 10))
          setEditing(true)
          requestAnimationFrame(() => inputRef.current?.select())
        }}
      >
        {(Math.round(exchangeCount * 10) / 10).toFixed(1)} değişim
      </button>
    )
  }

  function commit() {
    const parsed = Number(value.replace(',', '.'))
    setEditing(false)
    if (Number.isFinite(parsed) && parsed > 0) onCommit(parsed)
  }

  return (
    <Input
      ref={inputRef}
      type="number"
      min={0}
      step="0.5"
      value={value}
      className="h-7 w-20 px-1 text-right text-sm"
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === 'Tab') {
          commit()
        }
        if (event.key === 'Escape') setEditing(false)
      }}
    />
  )
}

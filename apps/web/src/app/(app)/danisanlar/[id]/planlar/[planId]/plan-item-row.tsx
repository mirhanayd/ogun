'use client'

import { useRef, useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Plus, ShieldAlert, X } from 'lucide-react'
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
//
// GitHub issue #61 / Faz 10, Prompt 10.3, GÖREV 2 — SÜTUN DÜZENİ VE RİTİM.
// Satırlar `flex ... gap-1.5` ile akıyordu: her sütunun genişliği içeriğine
// göre değişiyor, "150 g" ile "1500 g" yan yana gelince miktar ve kcal
// sütunları satırdan satıra KAYIYORDU. Artık tek bir sütun sözleşmesi var ve
// hem ana kalem hem alternatif satırları AYNI sağ kenar hizasını paylaşıyor:
//
//   [tutamak w-5] [besin adı esner] [miktar w-24] [kcal w-20] [eylemler w-14]
//   alternatif:   [        ad esner] [miktar w-24] [ boş w-20] [eylemler w-14]
//
// Sabitler tek yerde tanımlı ki iki satır tipi ayrışmasın.
const COL_AMOUNT = 'w-24 shrink-0'
const COL_KCAL = 'w-20 shrink-0'
const COL_ACTIONS = 'w-14 shrink-0'

// GÖREV 2: "Sil butonu ve '+ alternatif' yalnızca hover/odakta görünsün ama
// YER KAPLAMAYA DEVAM ETSİN (görünürken düzen zıplamasın)." — bu yüzden
// `hidden`/koşullu render DEĞİL, yalnızca `opacity`. Klavye kullanıcısı için
// odak (kendi odağı VE satırın içindeki herhangi bir odak) da gösterir;
// hover'ı olmayan dokunmatik cihazlarda (pointer: coarse) kalıcı görünür —
// aksi halde sürükleme tutamağına ve silme butonuna DOKUNARAK ERİŞİLEMİYORDU
// (bkz. plan-editor.tsx sensors notu).
const REVEAL_ON_HOVER =
  'opacity-0 transition-opacity group-hover/item:opacity-100 group-focus-within/item:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100'
const REVEAL_ON_HOVER_ALT =
  'opacity-0 transition-opacity group-hover/alt:opacity-100 group-focus-within/alt:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100'

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
  const conflictLabel =
    conflicts && conflicts.length > 0
      ? `Alerji/intolerans çakışması: ${conflicts.map((c) => c.entry.label).join(', ')}`
      : null

  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn('group/item rounded-md py-0.5', isDragging && 'opacity-50')}
    >
      {/* Sabit satır yüksekliği (min-h-8) — kalemler arasındaki dikey ritim
          içeriğe (uzun ad / çakışma ikonu / mod) göre DEĞİŞMESİN. */}
      <div className="flex min-h-8 items-center gap-2 rounded-md px-1.5 hover:bg-muted/50">
        <button
          type="button"
          className={cn(
            'w-5 shrink-0 cursor-grab touch-none text-muted-foreground',
            REVEAL_ON_HOVER,
          )}
          aria-label="Sürükle"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>

        <span
          className={cn(
            'min-w-0 flex-1 truncate text-body',
            isPending && 'text-muted-foreground italic',
          )}
          title={displayName}
        >
          {displayName}
          {isPending && ' (kaydediliyor…)'}
        </span>

        {conflictLabel && (
          <ShieldAlert className="size-4 shrink-0 text-destructive" aria-label={conflictLabel}>
            <title>{conflictLabel}</title>
          </ShieldAlert>
        )}

        <div className={cn('flex justify-end', COL_AMOUNT)}>
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
        </div>

        {/* GitHub issue #59 / #61 — sabit genişlikli, sağa hizalı sayısal
            sütun (`text-data` tabular-nums uygular): orantılı rakamlarda
            satırdan satıra kayıyordu. */}
        <span className={cn('text-right text-data text-muted-foreground', COL_KCAL)}>
          {kcal !== null ? `${kcal.toFixed(0)} kcal` : '—'}
        </span>

        <div className={cn('flex items-center justify-end gap-0.5', COL_ACTIONS)}>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={REVEAL_ON_HOVER}
            onClick={() => setShowAltSearch((v) => !v)}
            disabled={isPending}
            aria-label="Alternatif ekle"
            title="Alternatif ekle"
          >
            <Plus className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={cn('text-muted-foreground hover:text-destructive', REVEAL_ON_HOVER)}
            onClick={() => removeItemById(item.id)}
            aria-label="Kalemi sil"
            title="Kalemi sil"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      {item.note && <p className="ml-7 px-1.5 text-helper text-muted-foreground">{item.note}</p>}

      {/* GÖREV 2: "Alternatif (VEYA) satırları: girinti + sol kenar çizgisi ile
          görsel bağ." — girinti ana kalemin AD sütunuyla hizalanır (tutamak
          w-5 + gap), çizgi de bu kalemin alternatifleri olduğunu gösterir. */}
      {item.alternatives.length > 0 && (
        <ul className="mt-0.5 ml-7 flex flex-col border-l-2 border-border pl-2">
          {item.alternatives.map((alt) => (
            <AlternativeRow key={alt.id} alternative={alt} foodMacros={foodMacros} />
          ))}
        </ul>
      )}

      {showAltSearch && (
        <div className="mt-1 ml-7 border-l-2 border-border pl-2">
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
    <li className="group/alt flex min-h-7 items-center gap-2 rounded-md px-1.5 text-muted-foreground hover:bg-muted/50">
      <span className="shrink-0 text-helper font-medium tracking-wide uppercase">veya</span>
      <span className={cn('min-w-0 flex-1 truncate text-body', isPending && 'italic')}>
        {displayName}
      </span>
      {/* Ana kalemle AYNI sağ kenar hizası: miktar → kcal sütunu kadar boşluk
          → eylemler. Alternatiflerin kendi kcal'ı gösterilmiyor (ana kalemin
          yerine geçerler), ama sütun YERİ korunuyor ki hizalama bozulmasın. */}
      <span className={cn('text-right text-data', COL_AMOUNT)}>{alternative.amountGrams} g</span>
      <span className={COL_KCAL} aria-hidden />
      <div className={cn('flex items-center justify-end', COL_ACTIONS)}>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={cn('hover:text-destructive', REVEAL_ON_HOVER_ALT)}
          onClick={() => removeAlternativeById(alternative.id)}
          aria-label="Alternatifi sil"
          title="Alternatifi sil"
        >
          <X className="size-3.5" />
        </Button>
      </div>
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
        className="w-full rounded px-1 text-right text-data hover:bg-muted disabled:opacity-50"
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
      className="h-7 w-full px-1 text-right text-data"
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
        className="w-full rounded px-1 text-right text-data hover:bg-muted disabled:opacity-50"
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
      className="h-7 w-full px-1 text-right text-data"
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

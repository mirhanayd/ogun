'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react'
import { Bookmark, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { initFoodIndex, searchFoodsOffline, type FoodSearchHit } from '@/lib/food-index'
import { parseFoodInput, type ParsedFoodInput } from '@/lib/parse-food-input'
import type { FoodUsageDto } from '@/app/api/foods/usage/route'
import type { SavedMealDto } from '@/app/api/saved-meals/route'

// GitHub issue #24 / Prompt 5.2 — "90 saniyede liste" iddiasının teknik
// karşılığı: Dexie+Orama istemci indeksini (bkz. lib/food-index.ts, Hafta 1)
// kullanarak ağa çıkmadan anlık sonuç veren, doğal dil miktar ayrıştırmalı
// (bkz. lib/parse-food-input.ts) besin arama girişi.
//
// STANDALONE BİLEŞEN NOTU: GitHub issue #25 bu bileşeni AYNEN burada
// tarif edildiği gibi kullandı — kendi state'ini/bağlamını (aktif öğün,
// bkz. lib/stores/active-meal-store.ts) tutmuyor, sadece bir
// `onSelect(selection)` callback'i sunuyor. Editör tarafı (bkz.
// danisanlar/[id]/planlar/[planId]/meal-block.tsx ve plan-item-row.tsx)
// onSelect içinde plan-editor-store.ts'in addItemFromSelection/
// addAlternativeFromSelection eylemlerini çağırıyor (bunlar da
// apps/web/src/app/(app)/planlar/actions.ts'teki addItemAction/
// addAlternativeAction'a gidiyor). portionId eşlemesi hâlâ YOK — gerçek
// food_portions.id bağlantısı #26/ayrı bir issue'nun kapsamı, bu yüzden
// amount HER ZAMAN grama çevrilip portionId=null yazılıyor (bkz.
// lib/plan-nutrients.ts resolveGramsFromSelection).
export interface FoodSearchSelection {
  foodId: string
  nameTr: string
  groupNameTr: string | null
  kcalPer100g: number | null
  // GitHub issue #25 — plan editörünün öğün toplamı rozetleri (kcal + makro)
  // nutrition-core'un calculateMealNutrients'ını çağırabilsin diye eklendi;
  // #24'ün tasarladığı DTO'nun (bkz. yukarıdaki not) doğal bir genişlemesi.
  proteinPer100g: number | null
  carbPer100g: number | null
  fatPer100g: number | null
  defaultPortion: { label: string; grams: number } | null
  ingredientNames?: string[]
  amount: number
  unit?: ParsedFoodInput['unit']
  portion?: string
}

export interface FoodSearchInputProps {
  onSelect: (selection: FoodSearchSelection) => void
  // Tab tuşunda odağın taşınacağı miktar alanı (bkz. roadmap GÖREV 1: "Tab
  // ile miktara geç"). Verilmezse Tab varsayılan tarayıcı davranışını izler.
  quantityInputRef?: RefObject<HTMLInputElement | null>
  // GitHub issue #62 / Faz 10, Prompt 10.4, GÖREV 3 — "Plan editöründe Tab
  // sırasını uçtan uca test et: arama → miktar → sonraki kalem".
  //
  // BULUNAN GERÇEK HATA: yukarıdaki `quantityInputRef` yalnızca geliştirme
  // oyun alanında (app/dev/food-search-input/page.tsx) bağlanmıştı — GERÇEK
  // plan editöründe (meal-block.tsx) HİÇ verilmiyordu. Yani belgelenen
  // "Tab ile miktar alanına geç" akışı üründe ÇALIŞMIYORDU: arama kutusunda
  // Tab'a basmak tarayıcının varsayılan sırasını izliyor ve kalem satırları
  // DOM'da arama kutusundan ÖNCE geldiği için odak bir SONRAKİ ÖĞÜN BLOĞUNA
  // atlıyordu.
  //
  // Neden `quantityInputRef`i kullanmadık: plan editöründe miktar hücresi
  // tıklanana kadar bir <input> DEĞİL, bir <button> (bkz. plan-item-row.tsx
  // AmountEditor — "modal yok, tıkla-düzenle" deseni). RefObject<T> `current`
  // üzerinde değişken (mutable) olduğu için değişmez (invariant): bir
  // HTMLButtonElement ref'i HTMLInputElement ref'i bekleyen bu prop'a
  // GEÇİRİLEMEZ. Mevcut prop'un tipini gevşetmek dev sayfasındaki çağrıyı
  // kırardı; bunun yerine odaklanacak öğeyi ÇAĞIRANIN bulduğu bir geri çağrı
  // eklendi. `true` dönerse varsayılan sekme sırası engellenir.
  onTabToAmount?: () => boolean
  placeholder?: string
  autoFocus?: boolean
  className?: string
  // Geliştirme modunda arama gecikmesi rozetini göster (GÖREV 4). Varsayılan
  // NODE_ENV'e göre belirlenir, testte zorlamak için override edilebilir.
  showLatencyBadge?: boolean
  // GitHub issue #27 / Prompt 5.5, GÖREV 3 — "arama kutusunda '@' ile çağır".
  // Verilmezse '@' normal bir arama karakteri gibi davranır (STANDALONE
  // BİLEŞEN NOTU'na uygun — meal-block.tsx dışındaki çağıranlar bu prop'u
  // hiç geçmeyebilir, davranış geriye dönük uyumlu kalır).
  onInsertSavedMeal?: (savedMealId: string) => void
}

interface ResultRow {
  id: string
  nameTr: string
  groupNameTr: string | null
  kcalPer100g: number | null
  proteinPer100g: number | null
  carbPer100g: number | null
  fatPer100g: number | null
  defaultPortion: { label: string; grams: number } | null
  ingredientNames?: string[]
  pinned?: 'recent' | 'frequent'
}

function toResultRow(hit: FoodSearchHit): ResultRow {
  return {
    id: hit.id,
    nameTr: hit.nameTr,
    groupNameTr: hit.groupNameTr,
    kcalPer100g: hit.kcalPer100g,
    proteinPer100g: hit.proteinPer100g,
    carbPer100g: hit.carbPer100g,
    fatPer100g: hit.fatPer100g,
    defaultPortion: hit.defaultPortion,
    ingredientNames: hit.ingredientNames,
  }
}

function toPinnedRow(dto: FoodUsageDto): ResultRow {
  return {
    id: dto.id,
    nameTr: dto.nameTr,
    groupNameTr: dto.groupNameTr,
    kcalPer100g: dto.kcalPer100g,
    proteinPer100g: dto.proteinPer100g,
    carbPer100g: dto.carbPer100g,
    fatPer100g: dto.fatPer100g,
    defaultPortion: dto.defaultPortion,
    pinned: 'recent',
  }
}

// Seçilen besinin kullanım sayacını sunucuda artırır (bkz.
// api/foods/usage POST) — "sık/son kullanılanlar" cihazlar arası kalıcı
// olsun diye localStorage DEĞİL, clinic bazlı sunucu tarafı sayaç kullanılır.
// Fire-and-forget: bu isteğin gecikmesi/başarısızlığı seçim akışını
// ENGELLEMEMELİ (arama hızı iddiasıyla çelişir).
function fireRecordUsage(foodId: string) {
  fetch('/api/foods/usage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ foodId }),
  }).catch(() => {
    // Sessizce yut — kullanım sayacı best-effort bir özellik, aramayı
    // engellememeli. Kalıcı hata izleme ayrı bir gözlemlenebilirlik
    // konusunun kapsamında (bkz. audit.ts'teki benzer gerekçe).
  })
}

export function FoodSearchInput({
  onSelect,
  quantityInputRef,
  onTabToAmount,
  placeholder = 'Besin ara… (ör. "1 kase mercimek çorbası", "@" ile kayıtlı öğün)',
  autoFocus,
  className,
  showLatencyBadge = process.env.NODE_ENV !== 'production',
  onInsertSavedMeal,
}: FoodSearchInputProps) {
  const [indexStatus, setIndexStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [rawValue, setRawValue] = useState('')
  const [rows, setRows] = useState<ResultRow[]>([])
  const [pinnedRows, setPinnedRows] = useState<ResultRow[]>([])
  const [savedMeals, setSavedMeals] = useState<SavedMealDto[]>([])
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [open, setOpen] = useState(false)
  const [elapsedMs, setElapsedMs] = useState<number | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const requestIdRef = useRef(0)

  useEffect(() => {
    initFoodIndex()
      .then(() => setIndexStatus('ready'))
      .catch((error: unknown) => {
        console.error('[FoodSearchInput] indeks yüklenemedi:', error)
        setIndexStatus('error')
      })
  }, [])

  // Pinlenmiş liste bir kez, bileşen hazır olduğunda çekilir — arama her
  // tuş vuruşunda tekrar istemesin diye (zaten ağa hiç çıkmamak asıl amaç).
  useEffect(() => {
    if (indexStatus !== 'ready') return
    let cancelled = false
    fetch('/api/foods/usage')
      .then((res) => (res.ok ? (res.json() as Promise<FoodUsageDto[]>) : []))
      .then((dtos) => {
        if (!cancelled) setPinnedRows(dtos.map(toPinnedRow))
      })
      .catch(() => {
        // Pinleme "olursa iyi olur" bir özellik — başarısız olursa arama
        // yine de tam işlevsel kalmalı, bu yüzden sessiz düşer.
      })
    return () => {
      cancelled = true
    }
  }, [indexStatus])

  const parsed = useMemo(() => parseFoodInput(rawValue), [rawValue])

  // GitHub issue #27 / Prompt 5.5, GÖREV 3 — "@" tetikleyicisi. rawValue
  // (parsed.query DEĞİL — doğal dil ayrıştırıcı '@' işaretini bir miktar/
  // porsiyon kelimesi sanıp bozabilir) '@' ile başlıyorsa bileşen besin
  // arama modundan ÇIKIP kayıtlı öğün arama moduna geçer.
  const isSavedMealMode = rawValue.startsWith('@')
  const savedMealQuery = isSavedMealMode ? rawValue.slice(1).trim().toLocaleLowerCase('tr-TR') : ''
  const visibleSavedMeals = useMemo(() => {
    if (!isSavedMealMode) return []
    if (savedMealQuery === '') return savedMeals
    return savedMeals.filter((meal) =>
      meal.name.toLocaleLowerCase('tr-TR').includes(savedMealQuery),
    )
  }, [isSavedMealMode, savedMealQuery, savedMeals])

  useEffect(() => {
    if (isSavedMealMode) setHighlightedIndex(0)
  }, [isSavedMealMode, savedMealQuery])

  // Kayıtlı öğün listesi de (pinnedRows gibi) TEK seferlik çekilir — her
  // '@' vuruşunda ağa çıkmaz, istemci tarafında filtrelenir (bkz. yukarısı).
  useEffect(() => {
    if (!onInsertSavedMeal || indexStatus !== 'ready') return
    let cancelled = false
    fetch('/api/saved-meals')
      .then((res) => (res.ok ? (res.json() as Promise<SavedMealDto[]>) : []))
      .then((dtos) => {
        if (!cancelled) setSavedMeals(dtos)
      })
      .catch(() => {
        // "@" özelliği olursa iyi olur — başarısız olursa normal besin
        // araması yine de tam işlevsel kalır.
      })
    return () => {
      cancelled = true
    }
  }, [indexStatus, onInsertSavedMeal])

  useEffect(() => {
    if (indexStatus !== 'ready' || isSavedMealMode) return

    if (parsed.query.trim() === '') {
      setRows([])
      setElapsedMs(null)
      setHighlightedIndex(0)
      return
    }

    const requestId = ++requestIdRef.current
    searchFoodsOffline(parsed.query).then((result) => {
      // Yarış durumu koruması: kullanıcı hızlı yazarken önceki (artık bayat)
      // sorgunun sonucu sonradan dönerse ekrana YAZILMAZ.
      if (requestIdRef.current !== requestId) return
      setRows(result.hits.map(toResultRow))
      setElapsedMs(result.elapsedMs)
      setHighlightedIndex(0)
    })
  }, [parsed.query, indexStatus, isSavedMealMode])

  const visibleRows = parsed.query.trim() === '' ? pinnedRows : rows

  const commitSavedMeal = useCallback(
    (savedMealId: string) => {
      onInsertSavedMeal?.(savedMealId)
      setRawValue('')
      setOpen(false)
    },
    [onInsertSavedMeal],
  )

  const commitSelection = useCallback(
    (row: ResultRow) => {
      fireRecordUsage(row.id)
      onSelect({
        foodId: row.id,
        nameTr: row.nameTr,
        groupNameTr: row.groupNameTr,
        kcalPer100g: row.kcalPer100g,
        proteinPer100g: row.proteinPer100g,
        carbPer100g: row.carbPer100g,
        fatPer100g: row.fatPer100g,
        defaultPortion: row.defaultPortion,
        ingredientNames: row.ingredientNames,
        amount: parsed.amount,
        unit: parsed.unit,
        portion: parsed.portion,
      })
      setRawValue('')
      setRows([])
      setOpen(false)
    },
    [onSelect, parsed.amount, parsed.portion, parsed.unit],
  )

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // GÖREV 3 — "@" modundayken ok tuşları/Enter kayıtlı öğün listesinde
    // gezinir, besin arama satırlarını ETKİLEMEZ.
    const activeRows = isSavedMealMode ? visibleSavedMeals : visibleRows

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (activeRows.length === 0) return
      setOpen(true)
      setHighlightedIndex((prev) => (prev + 1) % activeRows.length)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (activeRows.length === 0) return
      setOpen(true)
      setHighlightedIndex((prev) => (prev - 1 + activeRows.length) % activeRows.length)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      if (isSavedMealMode) {
        const meal = visibleSavedMeals[highlightedIndex]
        if (meal) commitSavedMeal(meal.id)
        return
      }
      const row = visibleRows[highlightedIndex]
      if (row) commitSelection(row)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      return
    }
    if (event.key === 'Tab' && !isSavedMealMode) {
      if (quantityInputRef?.current) {
        event.preventDefault()
        setOpen(false)
        quantityInputRef.current.focus()
        return
      }
      // Odaklanacak bir miktar hücresi YOKSA (ör. öğünde henüz kalem yok)
      // geri çağrı false döner ve tarayıcının varsayılan sırası korunur.
      if (onTabToAmount?.()) {
        event.preventDefault()
        setOpen(false)
      }
    }
  }

  const latencyBadge =
    showLatencyBadge && elapsedMs !== null ? (
      <Badge
        variant={elapsedMs > 20 ? 'destructive' : 'secondary'}
        className="absolute top-1/2 right-2 -translate-y-1/2 font-mono"
      >
        {elapsedMs.toFixed(1)} ms
      </Badge>
    ) : null

  return (
    <div className={cn('relative w-full', className)}>
      <div className="relative">
        <Input
          ref={inputRef}
          value={rawValue}
          placeholder={indexStatus === 'loading' ? 'Besin indeksi yükleniyor…' : placeholder}
          disabled={indexStatus === 'loading' || indexStatus === 'error'}
          autoFocus={autoFocus}
          onChange={(event) => {
            setRawValue(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          className={cn(latencyBadge ? 'pr-16' : undefined)}
        />
        {indexStatus === 'loading' && (
          <Loader2 className="absolute top-1/2 right-2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
        {latencyBadge}
      </div>

      {indexStatus === 'error' && (
        <p className="mt-1 text-sm text-destructive">
          Besin indeksi yüklenemedi, sayfayı yenileyin.
        </p>
      )}

      {/* GÖREV 3 — "@" modu: besin arama listesinin YERİNE, kayıtlı öğün
          listesi gösterilir (aynı anda ikisi de AÇIK OLMAZ). */}
      {open && isSavedMealMode && onInsertSavedMeal && (
        <ul className="absolute z-50 mt-1 max-h-80 w-full overflow-auto rounded-lg border border-border bg-popover p-1 shadow-md">
          <li className="px-2 py-1 text-xs font-medium text-muted-foreground">Kayıtlı öğünler</li>
          {visibleSavedMeals.length === 0 && (
            <li className="px-2 py-1.5 text-sm text-muted-foreground">
              {savedMeals.length === 0 ? 'Henüz kayıtlı öğün yok.' : 'Eşleşen kayıtlı öğün yok.'}
            </li>
          )}
          {visibleSavedMeals.map((meal, index) => (
            <li key={meal.id}>
              <button
                type="button"
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm',
                  index === highlightedIndex
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-muted',
                )}
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => commitSavedMeal(meal.id)}
              >
                <span className="flex items-center gap-1.5 truncate">
                  <Bookmark className="size-3.5 shrink-0 text-muted-foreground" />
                  {meal.name}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {meal.itemCount} kalem
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && !isSavedMealMode && indexStatus === 'ready' && visibleRows.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-80 w-full overflow-auto rounded-lg border border-border bg-popover p-1 shadow-md">
          {parsed.query.trim() === '' && (
            <li className="px-2 py-1 text-xs font-medium text-muted-foreground">
              Son / sık kullanılanlar
            </li>
          )}
          {visibleRows.map((row, index) => (
            <li key={row.id}>
              <button
                type="button"
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm',
                  index === highlightedIndex
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-muted',
                )}
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => commitSelection(row)}
              >
                <span className="truncate">{row.nameTr}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {row.groupNameTr ?? '—'}
                  {row.defaultPortion ? ` · ${row.defaultPortion.label}` : ''}
                  {row.kcalPer100g !== null ? ` · ${row.kcalPer100g.toFixed(0)} kcal/100g` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

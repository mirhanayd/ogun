'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronsUpDown, Loader2, Pill, Plus, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { appendUniqueBy, removeByKey } from './catalog-selection'
import type {
  searchMedicationCatalogAction,
  searchMedicationSubstanceCatalogAction,
} from './catalog-actions'

type MedicationProductResult = Awaited<ReturnType<typeof searchMedicationCatalogAction>>[number]
type MedicationSubstanceResult = Awaited<
  ReturnType<typeof searchMedicationSubstanceCatalogAction>
>[number]

export type MedicationCatalogSelection =
  | {
      key: `product:${string}`
      kind: 'product'
      medicationProductId: string
      medicationSubstanceId: null
      name: string
      substanceNames: string[]
      barcode: string | null
      needsReview: false
    }
  | {
      key: `substance:${string}`
      kind: 'substance'
      medicationProductId: null
      medicationSubstanceId: string
      name: string
      substanceNames: string[]
      barcode: null
      needsReview: boolean
    }

export function MedicationCatalogSelector({
  value,
  onChange,
  disabled = false,
  onSearchProducts,
  onSearchSubstances,
}: {
  value: MedicationCatalogSelection[]
  onChange: (value: MedicationCatalogSelection[]) => void
  disabled?: boolean
  onSearchProducts: (query: string) => Promise<MedicationProductResult[]>
  onSearchSubstances: (query: string) => Promise<MedicationSubstanceResult[]>
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [products, setProducts] = useState<MedicationProductResult[]>([])
  const [substances, setSubstances] = useState<MedicationSubstanceResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  useEffect(() => {
    const normalizedQuery = query.trim()
    if (normalizedQuery.length < 2) {
      requestIdRef.current += 1
      setProducts([])
      setSubstances([])
      setLoading(false)
      setError(null)
      return
    }

    const requestId = ++requestIdRef.current
    setLoading(true)
    setError(null)
    const timeoutId = window.setTimeout(() => {
      void Promise.all([
        onSearchProducts(normalizedQuery),
        onSearchSubstances(normalizedQuery),
      ])
        .then(([productResults, substanceResults]) => {
          if (requestId !== requestIdRef.current) return
          setProducts(productResults)
          setSubstances(substanceResults)
        })
        .catch(() => {
          if (requestId === requestIdRef.current) {
            setProducts([])
            setSubstances([])
            setError('İlaç kataloğu aranamadı. Lütfen tekrar deneyin.')
          }
        })
        .finally(() => {
          if (requestId === requestIdRef.current) setLoading(false)
        })
    }, 250)

    return () => window.clearTimeout(timeoutId)
  }, [onSearchProducts, onSearchSubstances, query])

  function selectProduct(product: MedicationProductResult) {
    const selection: MedicationCatalogSelection = {
      key: `product:${product.id}`,
      kind: 'product',
      medicationProductId: product.id,
      medicationSubstanceId: null,
      name: product.name,
      substanceNames: product.substances.map((substance) => substance.nameTr),
      barcode: product.barcode,
      needsReview: false,
    }
    onChange(appendUniqueBy(value, selection, (item) => item.key))
    setQuery('')
  }

  function selectSubstance(substance: MedicationSubstanceResult) {
    const selection: MedicationCatalogSelection = {
      key: `substance:${substance.id}`,
      kind: 'substance',
      medicationProductId: null,
      medicationSubstanceId: substance.id,
      name: substance.nameTr,
      substanceNames: [],
      barcode: null,
      needsReview: substance.needsReview,
    }
    onChange(appendUniqueBy(value, selection, (item) => item.key))
    setQuery('')
  }

  const availableProducts = products.filter(
    (product) => !value.some((selection) => selection.key === `product:${product.id}`),
  )
  const availableSubstances = substances.filter(
    (substance) => !value.some((selection) => selection.key === `substance:${substance.id}`),
  )

  return (
    <div className="flex flex-col gap-3">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label="İlaç kataloğundan seçim yap"
            disabled={disabled}
            className="w-full justify-between font-normal"
          >
            <span className="flex items-center gap-2">
              <Plus className="size-4" />
              İlaç veya etkin madde ekle
            </span>
            <ChevronsUpDown className="size-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(40rem,calc(100vw-2rem))] p-0">
          <Command shouldFilter={false}>
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder="Örn. glif, metformin veya barkod…"
              aria-label="İlaç ve etkin madde kataloğunda ara"
            />
            <CommandList>
              {query.trim().length < 2 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Aramak için en az 2 karakter yazın.
                </p>
              ) : loading ? (
                <p
                  className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-muted-foreground"
                  role="status"
                >
                  <Loader2 className="size-4 animate-spin" />
                  Katalog aranıyor…
                </p>
              ) : error ? (
                <p className="px-3 py-6 text-center text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : (
                <>
                  <CommandEmpty>Bu aramayla eşleşen ilaç veya etkin madde bulunamadı.</CommandEmpty>
                  {availableProducts.length > 0 && (
                    <CommandGroup heading="Ruhsatlı ilaç ürünleri">
                      {availableProducts.map((product) => (
                        <CommandItem
                          key={product.id}
                          value={`product:${product.id}`}
                          onSelect={() => selectProduct(product)}
                          className="items-start py-2.5"
                        >
                          <Pill className="mt-0.5 size-4 text-primary" />
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium">{product.name}</span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              {product.substances.map((substance) => substance.nameTr).join(', ') ||
                                product.activeIngredientRaw ||
                                'Etkin madde bilgisi belirtilmemiş'}
                            </span>
                            {product.barcode && (
                              <span className="mt-0.5 block text-[11px] text-muted-foreground/80">
                                Barkod: {product.barcode}
                              </span>
                            )}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                  {availableSubstances.length > 0 && (
                    <CommandGroup heading="Yalnız etkin madde biliniyorsa">
                      {availableSubstances.map((substance) => (
                        <CommandItem
                          key={substance.id}
                          value={`substance:${substance.id}`}
                          onSelect={() => selectSubstance(substance)}
                          className="items-start py-2.5"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-1.5 font-medium">
                              {substance.nameTr}
                              {substance.needsReview && (
                                <Badge variant="outline">İnceleme gerekli</Badge>
                              )}
                            </span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              Canonical etkin madde
                            </span>
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Seçili ilaçlar ve etkin maddeler">
          {value.map((medication) => (
            <li key={medication.key}>
              <Badge variant="secondary" className="gap-1 py-1 pl-2.5 pr-1">
                <span className="flex flex-col items-start">
                  <span>{medication.name}</span>
                  {medication.substanceNames.length > 0 && (
                    <span className="text-[10px] font-normal text-muted-foreground">
                      {medication.substanceNames.join(', ')}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => onChange(removeByKey(value, medication.key, (item) => item.key))}
                  aria-label={`${medication.name} seçimini kaldır`}
                  disabled={disabled}
                  className="grid size-5 place-items-center rounded-full hover:bg-foreground/10"
                >
                  <X className="size-3" />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

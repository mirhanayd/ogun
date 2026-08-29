'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronsUpDown, Loader2, Plus, X } from 'lucide-react'
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
import { searchConditionCatalogAction } from './catalog-actions'

type ConditionResult = Awaited<ReturnType<typeof searchConditionCatalogAction>>[number]

export interface ConditionCatalogSelection {
  conditionId: string
  nameTr: string
  nameEn: string
  sourceCode: string
  isNeoplasm: boolean
  needsReview: boolean
}

export function ConditionCatalogSelector({
  value,
  onChange,
  disabled = false,
}: {
  value: ConditionCatalogSelection[]
  onChange: (value: ConditionCatalogSelection[]) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ConditionResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  useEffect(() => {
    const normalizedQuery = query.trim()
    if (normalizedQuery.length < 2) {
      requestIdRef.current += 1
      setResults([])
      setLoading(false)
      setError(null)
      return
    }

    const requestId = ++requestIdRef.current
    setLoading(true)
    setError(null)
    const timeoutId = window.setTimeout(() => {
      void searchConditionCatalogAction(normalizedQuery)
        .then((items) => {
          if (requestId === requestIdRef.current) setResults(items)
        })
        .catch(() => {
          if (requestId === requestIdRef.current) {
            setResults([])
            setError('Hastalık kataloğu aranamadı. Lütfen tekrar deneyin.')
          }
        })
        .finally(() => {
          if (requestId === requestIdRef.current) setLoading(false)
        })
    }, 250)

    return () => window.clearTimeout(timeoutId)
  }, [query])

  function selectCondition(condition: ConditionResult) {
    onChange(
      appendUniqueBy(
        value,
        {
          conditionId: condition.id,
          nameTr: condition.matchedAlias ?? condition.nameTr,
          nameEn: condition.nameEn,
          sourceCode: condition.sourceCode,
          isNeoplasm: condition.isNeoplasm,
          needsReview: condition.needsReview,
        },
        (item) => item.conditionId,
      ),
    )
    setQuery('')
  }

  const availableResults = results.filter(
    (result) => !value.some((selected) => selected.conditionId === result.id),
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
            aria-label="Hastalık kataloğundan seçim yap"
            disabled={disabled}
            className="w-full justify-between font-normal"
          >
            <span className="flex items-center gap-2">
              <Plus className="size-4" />
              Hastalık veya kanser türü ekle
            </span>
            <ChevronsUpDown className="size-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(36rem,calc(100vw-2rem))] p-0">
          <Command shouldFilter={false}>
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder="Örn. tip 2 diy, meme kanseri…"
              aria-label="Hastalık kataloğunda ara"
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
                  <CommandEmpty>Bu aramayla eşleşen hastalık bulunamadı.</CommandEmpty>
                  <CommandGroup heading="Katalog sonuçları">
                    {availableResults.map((condition) => (
                      <CommandItem
                        key={condition.id}
                        value={condition.id}
                        onSelect={() => selectCondition(condition)}
                        className="items-start py-2.5"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-1.5 font-medium">
                            {condition.matchedAlias ?? condition.nameTr}
                            {condition.isNeoplasm && <Badge variant="secondary">Kanser</Badge>}
                            {condition.needsReview && (
                              <Badge variant="outline">İnceleme gerekli</Badge>
                            )}
                          </span>
                          {condition.nameEn !== (condition.matchedAlias ?? condition.nameTr) && (
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              {condition.nameEn}
                            </span>
                          )}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Seçili hastalıklar">
          {value.map((condition) => (
            <li key={condition.conditionId}>
              <Badge variant="secondary" className="gap-1 py-1 pl-2.5 pr-1">
                <span>{condition.nameTr}</span>
                <button
                  type="button"
                  onClick={() =>
                    onChange(removeByKey(value, condition.conditionId, (item) => item.conditionId))
                  }
                  aria-label={`${condition.nameTr} seçimini kaldır`}
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

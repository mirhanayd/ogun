'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { initFoodIndex, searchFoodsOffline, type FoodSearchHit } from '@/lib/food-index'

export default function FoodSearchDevPage() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<FoodSearchHit[]>([])
  const [elapsedMs, setElapsedMs] = useState<number | null>(null)

  useEffect(() => {
    initFoodIndex()
      .then(() => setStatus('ready'))
      .catch((error: unknown) => {
        console.error(error)
        setStatus('error')
      })
  }, [])

  useEffect(() => {
    if (status !== 'ready' || query.trim() === '') {
      setHits([])
      setElapsedMs(null)
      return
    }
    let cancelled = false
    searchFoodsOffline(query).then((result) => {
      if (cancelled) return
      setHits(result.hits)
      setElapsedMs(result.elapsedMs)
    })
    return () => {
      cancelled = true
    }
  }, [query, status])

  return (
    <main className="mx-auto max-w-xl space-y-4 p-8">
      <h1 className="text-2xl font-semibold">Besin Arama (geliştirme)</h1>

      {status === 'loading' && <Skeleton className="h-10 w-full" />}
      {status === 'error' && <p className="text-destructive">İndeks yüklenemedi.</p>}

      {status === 'ready' && (
        <>
          <Input
            autoFocus
            placeholder="Besin ara..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />

          {elapsedMs !== null && (
            <Badge variant={elapsedMs > 20 ? 'destructive' : 'secondary'}>{elapsedMs.toFixed(1)} ms</Badge>
          )}

          <ul className="divide-y">
            {hits.map((hit) => (
              <li key={hit.id} className="flex items-center justify-between py-2">
                <span>{hit.nameTr}</span>
                <span className="text-sm text-muted-foreground">
                  {hit.kcalPer100g !== null ? `${hit.kcalPer100g.toFixed(0)} kcal/100g` : '—'}
                  {hit.defaultPortion ? ` · ${hit.defaultPortion.label}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  )
}

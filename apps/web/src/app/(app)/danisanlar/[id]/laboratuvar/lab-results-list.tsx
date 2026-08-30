'use client'

import { useState, useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { LabResultChartPoint } from '@/screens/lab-results-view'

function formatDateTr(iso: string): string {
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })
}

// GÖREV 2 — "Anormal değerler ... rozet olarak görünsün": bu liste her satırda
// da AYNI rozeti tekrarlar (grafik + özet kart dışında, en ayrıntılı görünüm
// burası — diyetisyen hangi TARİHTEKİ hangi değerin anormal olduğunu tek tek
// görebilmeli, sadece "en güncel" değil).
export function LabResultsList({ results, onDelete }: { results: LabResultChartPoint[]; onDelete: (id: string) => Promise<unknown> }) {
  const [isPending, startTransition] = useTransition()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function handleDelete(id: string) {
    setDeletingId(id)
    startTransition(async () => {
      await onDelete(id)
      setDeletingId(null)
    })
  }

  if (results.length === 0) {
    return <p className="text-sm text-muted-foreground">Henüz sonuç eklenmedi.</p>
  }

  return (
    <div className="flex flex-col divide-y divide-border rounded-lg border">
      {results.map((result) => (
        <div key={result.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
          <span className="w-28 shrink-0 text-muted-foreground">{formatDateTr(result.testedAt)}</span>
          <span className="w-40 shrink-0 font-medium">{result.analyte}</span>
          <span>
            {result.value} {result.unit}
          </span>
          {(result.refMin !== null || result.refMax !== null) && (
            <span className="text-xs text-muted-foreground">
              (referans {result.refMin ?? '—'}–{result.refMax ?? '—'})
            </span>
          )}
          {result.isAbnormal === true && <Badge variant="destructive">Anormal</Badge>}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="ml-auto size-7"
            disabled={isPending && deletingId === result.id}
            onClick={() => handleDelete(result.id)}
            aria-label="Sonucu sil"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ))}
    </div>
  )
}

import { PageHeaderSkeleton } from '@/components/skeletons'
import { Skeleton } from '@/components/ui/skeleton'

// GitHub issue #62 / Prompt 10.4, GÖREV 1 — randevu takvimi bir IZGARA
// (bkz. calendar-grid.tsx: solda saat sütunu, yanında 7 gün sütunu).
// Jenerik kart iskeleti burada tamamen yanıltıcıydı.
export default function RandevularLoading() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeaderSkeleton />
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-6 w-24 rounded-full" />
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border border-border">
        <div className="flex border-b border-border bg-muted/40">
          <div className="w-14 shrink-0 border-r border-border p-2" />
          {Array.from({ length: 7 }, (_, index) => (
            <div key={index} className="flex-1 border-r border-border p-2 last:border-r-0">
              <Skeleton className="h-3.5 w-16" />
            </div>
          ))}
        </div>
        {Array.from({ length: 8 }, (_, rowIndex) => (
          <div key={rowIndex} className="flex border-b border-border last:border-b-0">
            <div className="w-14 shrink-0 border-r border-border p-2">
              <Skeleton className="h-3 w-8" />
            </div>
            {Array.from({ length: 7 }, (_, columnIndex) => (
              <div key={columnIndex} className="h-12 flex-1 border-r border-border p-1 last:border-r-0">
                {(rowIndex + columnIndex) % 4 === 0 && <Skeleton className="h-full w-full rounded-md" />}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

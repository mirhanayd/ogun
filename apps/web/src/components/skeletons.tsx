import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

// GitHub issue #62 / Faz 10, Prompt 10.4, GÖREV 1 — "Skeleton'lar gerçek
// içeriğin düzenine benzesin (jenerik gri kutu değil)."
//
// Bugüne kadar (app) altındaki TÜM sayfalar tek bir loading.tsx'i (altı adet
// 112px'lik gri dikdörtgen) paylaşıyordu; danışan TABLOSU, randevu TAKVİMİ ve
// finans ÖZET KARTLARI aynı iskeletle bekletiliyor, içerik gelince yerleşim
// zıplıyordu. Aşağıdaki parçalar gerçek bileşenlerin ölçülerini taklit eder
// (tablo satır yüksekliği, kart ızgarası sütun sayısı, takvim sütunları) —
// böylece iskeletten içeriğe geçişte düzen kaymıyor.

export function PageHeaderSkeleton({ withAction = true }: { withAction?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-col gap-2">
        {/* text-title (24/32px) + açıklama satırı (text-body) */}
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
      {withAction && (
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-28 rounded-lg" />
          <Skeleton className="h-8 w-32 rounded-lg" />
        </div>
      )}
    </div>
  )
}

// Danışan listesi gibi gerçek bir <Table> için: filtre şeridi + başlık satırı
// + eşit yükseklikte satırlar (bkz. components/ui/table.tsx satır yüksekliği).
export function TableSkeleton({ rows = 8, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-8 w-56 rounded-lg" />
        <Skeleton className="h-8 w-32 rounded-lg" />
        <Skeleton className="h-8 w-40 rounded-lg" />
      </div>
      <div className="overflow-hidden rounded-xl border border-border">
        <div className="flex items-center gap-4 border-b border-border bg-muted/40 px-3 py-2">
          {Array.from({ length: columns }, (_, index) => (
            <Skeleton key={index} className="h-3.5 flex-1" />
          ))}
        </div>
        {Array.from({ length: rows }, (_, rowIndex) => (
          <div
            key={rowIndex}
            className="flex items-center gap-4 border-b border-border px-3 py-3 last:border-b-0"
          >
            {Array.from({ length: columns }, (_, columnIndex) => (
              <Skeleton key={columnIndex} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// /finans ve /panel'in üstündeki dört sütunlu özet kart şeridi.
export function StatCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }, (_, index) => (
        <Card key={index}>
          <CardContent className="flex items-center gap-3 py-4">
            <Skeleton className="size-5 rounded-full" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-5 w-20" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// Şablon kütüphanesi / kart ızgarası olan sayfalar.
export function CardGridSkeleton({
  count = 6,
  columns = 3,
  lines = 2,
}: {
  count?: number
  columns?: 2 | 3
  lines?: number
}) {
  return (
    <div
      className={
        columns === 2
          ? 'grid grid-cols-1 gap-3 sm:grid-cols-2'
          : 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'
      }
    >
      {Array.from({ length: count }, (_, index) => (
        <Card key={index}>
          <CardHeader>
            <Skeleton className="h-4 w-2/3" />
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {Array.from({ length: lines }, (_, lineIndex) => (
              <Skeleton key={lineIndex} className="h-3.5 w-full" />
            ))}
            <Skeleton className="h-8 w-full rounded-lg" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

import { CardGridSkeleton, PageHeaderSkeleton } from '@/components/skeletons'
import { Skeleton } from '@/components/ui/skeleton'

// GitHub issue #62 / Prompt 10.4, GÖREV 1 — şablon kütüphanesi: başlık,
// kategori filtre hapları (pill), üç sütunlu şablon kartı ızgarası.
export default function SablonlarLoading() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeaderSkeleton withAction={false} />
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-6 w-20 rounded-full" />
        ))}
      </div>
      <CardGridSkeleton count={6} columns={3} lines={2} />
    </div>
  )
}

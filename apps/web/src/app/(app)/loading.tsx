import { Skeleton } from '@/components/ui/skeleton'

// Next.js'in dosya tabanlı Suspense sınırı: (app) grubu altındaki herhangi
// bir sayfa (kendi loading.tsx'i yoksa) sunucuda veri beklerken bu iskelet
// gösterilir — bkz. GitHub issue #11 / Prompt 3.2, GÖREV 4 ("kabuğun async
// sınırları için skeleton bileşenleri").
export default function AppLoading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-8 w-28 rounded-lg" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-28 rounded-xl" />
        ))}
      </div>
    </div>
  )
}

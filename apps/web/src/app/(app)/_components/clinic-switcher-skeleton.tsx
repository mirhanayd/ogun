import { Skeleton } from '@/components/ui/skeleton'

// clinic_members sorgusu tamamlanana kadar gösterilen iskelet — bkz.
// GitHub issue #11 / Prompt 3.2, GÖREV 4 ("kabuğun async sınırları için
// skeleton"). clinic-switcher.tsx bir async server component olduğu için
// bu, top-bar.tsx içinde bir <Suspense fallback> olarak kullanılıyor.
export function ClinicSwitcherSkeleton() {
  return (
    <div className="flex items-center gap-2">
      <Skeleton className="size-6 rounded-full" />
      <Skeleton className="h-4 w-24 rounded" />
    </div>
  )
}

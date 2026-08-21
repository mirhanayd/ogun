import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export default function FinansLoading() {
  return (
    <div className="flex flex-col gap-7 pb-8">
      <section className="flex flex-col gap-5 border-b border-border/70 pb-7 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-3">
          <Skeleton className="h-3 w-44" />
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-4 w-full max-w-lg" />
        </div>
        <Skeleton className="h-11 w-full rounded-xl xl:w-72" />
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Card key={index} className="border-border/70 bg-card/85">
            <CardContent className="flex min-h-36 flex-col justify-between p-5">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-2.5 w-24" />
                  <Skeleton className="h-3.5 w-28" />
                </div>
                <Skeleton className="size-9 rounded-xl" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-7 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {Array.from({ length: 2 }, (_, index) => (
          <Card key={index} className="border-border/70 bg-card/90">
            <CardHeader className="border-b border-border/60 px-5 pb-4 sm:px-6">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-52" />
            </CardHeader>
            <CardContent className="space-y-4 px-5 sm:px-6">
              {Array.from({ length: 3 }, (_, rowIndex) => (
                <div key={rowIndex} className="flex items-center gap-3">
                  <Skeleton className="size-9 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-2/3" />
                    <Skeleton className="h-2 w-full rounded-full" />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-5 w-48" />
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          {Array.from({ length: 2 }, (_, index) => (
            <Card key={index} className="border-border/70 bg-card/90">
              <CardHeader className="border-b border-border/60 px-5 pb-4 sm:px-6">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-48" />
              </CardHeader>
              <CardContent className="space-y-4 px-5 sm:px-6">
                {Array.from({ length: 3 }, (_, rowIndex) => (
                  <div key={rowIndex} className="flex items-center gap-3">
                    <Skeleton className="size-10 rounded-xl" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3.5 w-3/5" />
                      <Skeleton className="h-3 w-4/5" />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  )
}
